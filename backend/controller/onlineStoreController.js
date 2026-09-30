const crypto = require("crypto");
const mongoose = require("mongoose");
const OnlineCategory = require("../models/OnlineCategorymodel");
const OnlineListing = require("../models/OnlineListingmodel");
const OnlineHeroSlide = require("../models/OnlineHeroSlidemodel");
const OnlineOrder = require("../models/OnlineOrdermodel");
const OnlineNewsletterSubscriber = require("../models/OnlineNewsletterSubscribermodel");
const OnlineVoucher = require("../models/OnlineVouchermodel");
const Deal = require("../models/Dealmodel");
const { eventDealIds, priceEventDeals } = require("../libs/onlineDeals");
const OnlineStoreSetting = require("../models/OnlineStoreSettingmodel");
const OnlineBlogPost = require("../models/OnlineBlogPostmodel");
const {
  sanitizeRichText,
  readingMinutes,
  excerptFrom,
} = require("../libs/richText");

/* Legal pages hold markup now, not bare text. The same words cost roughly
 * three times as many characters once they carry headings, links and lists, so
 * the old 20k ceiling would have started truncating real policies mid-sentence.
 * Kept in step with `maxlength` on OnlineStoreSetting.policies. */
const POLICY_MAX_LENGTH = 80000;
const OnlineReview = require("../models/OnlineReviewmodel");
const OnlineCustomer = require("../models/OnlineCustomermodel");
const Product = require("../models/Productmodel");
const Sale = require("../models/Salesmodel");
const StockTransaction = require("../models/StockTranscationmodel");
const Store = require("../models/Storemodel");
const Category = require("../models/ Categorymodel");
const { nextSequence } = require("../models/Countermodel");
const logActivity = require("../libs/logger");
const { emitStockChanged } = require("../libs/stockEvents");
const loyalty = require("../libs/loyalty");
const { refreshOrderStats } = require("../libs/customerStats");
const { sendMail, brandedHtml, esc } = require("../libs/mailer");

// Same rounding the till uses, so a web total and a counter total can never
// disagree by a stray fraction of a cent.
const money = (value) => Math.round(Number(value || 0) * 100) / 100;
const FREE_SHIPPING_THRESHOLD = 100; // fallback default when settings unset
const SHIPPING_FLAT = 4.99; // fallback default when settings unset

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const sendCsv = (res, filename, headers, rows) => {
  const csv = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.status(200).send(`\uFEFF${csv}`);
};

// Human-facing order number: a branded prefix plus a 1000-based sequence, so
// Branded, support-friendly reference: COP-2026-1001. The global atomic
// sequence keeps it collision-safe under concurrent checkouts, while the year
// makes an order immediately recognisable in email, admin, receipts and calls.
// Existing WEB-* / CP-* references stay untouched and fully valid.
const ORDER_NO_PREFIX = "COP";
const ORDER_NO_BASE = 1000;
const formatOrderNo = (seq, at = new Date()) =>
  `${ORDER_NO_PREFIX}-${at.getUTCFullYear()}-${ORDER_NO_BASE + Number(seq)}`;

// Shipping charged for an order of `amount`, using the shop's configured rate
// (Admin → Online store → Settings → Shipping) with the constants above as a
// safe fallback. Free at or above the threshold.
const shippingFor = (settings, amount) => {
  const flat = Number(settings?.shipping?.flatRate ?? SHIPPING_FLAT);
  const free = Number(settings?.shipping?.freeThreshold ?? FREE_SHIPPING_THRESHOLD);
  return amount >= free ? 0 : Math.round(flat * 100) / 100;
};

/* ───────────────────────────────────────────────────────────────────────────
 * Tenant scope.
 *
 * Every online document carries `store`. Today that resolves to the single
 * shop, so this is one lookup; when the platform goes multi-tenant this is the
 * ONE function that changes — every query below is already scoped by it.
 * ───────────────────────────────────────────────────────────────────────── */
let cachedStoreId = null;
const storeId = async () => {
  if (cachedStoreId) return cachedStoreId;
  const shop = await Store.findOne({ key: "shop" }).select("_id").lean();
  if (!shop) throw new Error("Shop is not set up yet");
  cachedStoreId = shop._id;
  return cachedStoreId;
};

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const storefrontCacheMs = () => {
  const configured = Number(
    process.env.STOREFRONT_CATALOG_CACHE_MS ||
      process.env.PRODUCT_CATALOG_CACHE_MS ||
      2000,
  );
  return Number.isFinite(configured) && configured >= 0
    ? Math.min(configured, 15_000)
    : 2000;
};

const storefrontReadCache = new Map();
const storefrontPendingReads = new Map();

const invalidateStorefrontReadCache = () => {
  storefrontReadCache.clear();
};

const cachedStorefrontRead = async (key, loader) => {
  const hit = storefrontReadCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  if (storefrontPendingReads.has(key)) return storefrontPendingReads.get(key);

  const request = Promise.resolve()
    .then(loader)
    .then((value) => {
      storefrontReadCache.set(key, {
        value,
        expiresAt: Date.now() + storefrontCacheMs(),
      });
      return value;
    })
    .finally(() => {
      storefrontPendingReads.delete(key);
    });

  storefrontPendingReads.set(key, request);
  return request;
};

const emit = (req, event, payload) => {
  invalidateStorefrontReadCache();
  try {
    req.app.get("io")?.emit(event, payload);
  } catch {
    /* realtime is best-effort — never fail a sale over a socket */
  }
};

/* The price the website charges: the listing's override when set, otherwise
 * the shelf price. Stock is never overridable — see the listing model. */
const listingPrice = (listing, product) =>
  listing?.priceOverride != null ? listing.priceOverride : product.Price;

const saleIsActive = (listing, at = new Date()) => {
  const salePrice = Number(listing?.salePrice);
  if (!Number.isFinite(salePrice) || salePrice <= 0) return false;
  if (listing.saleStartsAt && new Date(listing.saleStartsAt) > at) return false;
  if (listing.saleEndsAt && new Date(listing.saleEndsAt) < at) return false;
  return true;
};

const regularItemPrice = (listing, product, variant = null) =>
  variant?.priceOverride != null
    ? Number(variant.priceOverride)
    : Number(listingPrice(listing, product));

// How many of the item unlock the deal. 1 (or null) = an ordinary always-on
// sale; >= 2 = a "buy N+" quantity deal.
const dealMinQty = (listing) => {
  const n = Math.floor(Number(listing?.dealMinQty));
  return Number.isFinite(n) && n >= 1 ? n : 1;
};

// A base-price sale lowers the shown price for every unit. A quantity deal
// (minQty >= 2) does NOT — it is surfaced separately as `qtyDeal`, so the price
// only drops once the shopper reaches the threshold.
const baseSaleActive = (listing) =>
  saleIsActive(listing) && dealMinQty(listing) <= 1;

// The price the storefront displays for a single unit. Owned entirely by
// OnlineListing — Product.Price (the POS/inventory price) is never written here.
const displayPrice = (listing, product, variant = null) =>
  baseSaleActive(listing)
    ? Number(listing.salePrice)
    : regularItemPrice(listing, product, variant);

// The price actually charged for a line, given its quantity: the sale price
// applies once the quantity reaches the deal minimum (1 for an ordinary sale).
const effectiveItemPrice = (listing, product, variant = null, qty = 1) =>
  saleIsActive(listing) && qty >= dealMinQty(listing)
    ? Number(listing.salePrice)
    : regularItemPrice(listing, product, variant);

/* Shape a listing + its product into what the storefront renders. */
const publicListing = (l, { compact = false, includeLinked = true } = {}) => {
  const p = l.product;
  if (!p) return null;
  const activeSale = baseSaleActive(l);
  const variants = (l.variants || [])
    .filter((variant) => variant.product && variant.product._id)
    .map((variant) => ({
      productId: String(variant.product._id),
      label: variant.label,
      kind: variant.kind || "option",
      price: money(displayPrice(l, variant.product, variant)),
      regularPrice: money(regularItemPrice(l, variant.product, variant)),
      stock: Number(variant.product.quantity || 0),
      image: variant.image || "",
      imageAlt: variant.imageAlt || variant.label || p.name,
    }));

  const linkedListings = includeLinked
    ? (l.linkedListings || [])
        .filter((link) => link?.listing && link.listing.product)
        .sort((a, b) => Number(a.sortWeight || 0) - Number(b.sortWeight || 0))
        .map((link) => {
          const child = publicListing(link.listing, {
            compact: false,
            includeLinked: false,
          });
          if (!child) return null;
          return {
            ...child,
            familyLabel: String(link.label || child.name).trim() || child.name,
            familyImage: link.image || "",
            familyImageAlt: link.imageAlt || link.label || child.name,
          };
        })
        .filter(Boolean)
    : [];

  const prices = variants.length
    ? variants.map((variant) => variant.price)
    : [money(displayPrice(l, p))];
  const regularPrices = variants.length
    ? variants.map((variant) => variant.regularPrice)
    : [money(regularItemPrice(l, p))];
  const stock = variants.length
    ? variants.reduce((sum, variant) => sum + variant.stock, 0)
    : Number(p.quantity || 0);
  const price = Math.min(...prices);
  const regularPrice = Math.min(...regularPrices);
  const manualCompareAt = Number(l.compareAtPrice || 0);
  const compareAt = activeSale
    ? money(Math.max(manualCompareAt, regularPrice))
    : manualCompareAt > price
      ? money(manualCompareAt)
      : null;
  const tags = Array.from(
    new Set([...(l.tags || []), ...(activeSale ? ["sale"] : [])]),
  );

  // A live quantity deal ("buy N+, €X each") — surfaced alongside the regular
  // price so the storefront can invite the shopper to reach the threshold.
  const qtyDeal =
    saleIsActive(l) && dealMinQty(l) >= 2
      ? {
          minQty: dealMinQty(l),
          price: money(Number(l.salePrice)),
          regularPrice,
          image: l.dealImage?.url || "",
          imageAlt: l.dealImage?.alt || l.webName || p.name,
        }
      : null;

  const shared = {
    id: String(l._id),
    productId: String(p._id),
    slug: l.slug,
    name: l.webName || p.name,
    brand: l.brand,
    category: l.category
      ? {
          id: String(l.category._id || l.category),
          slug: l.category.slug,
          name: l.category.name,
        }
      : null,
    categories: (l.categories || []).filter(Boolean).map((category) => ({
      id: String(category._id || category),
      slug: category.slug,
      name: category.name,
    })),
    image: l.gallery?.[0]?.url || p.image?.url || "",
    imageAlt:
      l.gallery?.[0]?.alt || l.webName || p.name,
    catalogImage: l.catalogImage?.url || "",
    catalogImageAlt: l.catalogImage?.alt || l.webName || p.name,
    variants,
    variantLabel: l.variantLabel || "",
    selfVariantLabel: l.selfVariantLabel || "",
    linkedListings,
    tags,
    price,
    regularPrice,
    compareAt: compareAt > price ? compareAt : null,
    sale: activeSale,
    saleEndsAt: activeSale && l.saleEndsAt ? l.saleEndsAt : null,
    // A quantity deal (buy N+ for a lower unit price), or null when none is live.
    qtyDeal,
    // Promo image for whichever deal is live (base sale or quantity deal).
    dealImage: saleIsActive(l) && l.dealImage?.url ? l.dealImage.url : "",
    dealImageAlt:
      saleIsActive(l) && l.dealImage?.url
        ? l.dealImage.alt || l.webName || p.name
        : "",
    publishedAt: l.createdAt,
    // Live from the shared ledger — the same number the till reads.
    stock,
    featured: l.featured,
    // Verified-purchase review summary, attached by the caller (0/0 if none).
    rating: l.rating || { average: 0, count: 0 },
  };

  if (compact) return shared;

  return {
    ...shared,
    short: l.shortDescription,
    description: l.description,
    gallery: l.gallery || [],
    specs: l.specs instanceof Map ? Object.fromEntries(l.specs) : l.specs || {},
    flavour: l.flavour,
    optionLabel: l.optionLabel || "",
  };
};

// Published-review summary per listing for a store, as
// { listingId -> { average, count } }. One aggregation feeds both the product
// page and the listing grids so stars can render without an N+1.
async function ratingByListing(store, listingIds = null) {
  const match = { store, status: "published" };
  if (listingIds) match.listing = { $in: listingIds };
  const rows = await OnlineReview.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$listing",
        average: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);
  const map = new Map();
  for (const r of rows) {
    map.set(String(r._id), {
      average: Math.round((r.average || 0) * 10) / 10,
      count: r.count,
    });
  }
  return map;
}

const requestError = (statusCode, message, extra = {}) =>
  Object.assign(new Error(message), { statusCode, ...extra });

const eventPriceForItem = (settings, listingId, item) => {
  const requestedEvent = String(item?.eventId || "").trim();
  if (!requestedEvent || requestedEvent !== String(listingId)) return null;
  const eventItem = (settings?.events?.items || []).find(
    (entry) =>
      entry?.enabled &&
      entry.kind === "product" &&
      String(entry.targetId) === String(listingId) &&
      String(entry.targetId) === requestedEvent,
  );
  const eventPrice = Number(eventItem?.eventPrice);
  return Number.isFinite(eventPrice) && eventPrice > 0 ? money(eventPrice) : null;
};

// Resolve every basket line from server-owned catalogue data. Both voucher
// preview and final checkout use this function, so a browser can never invent
// a product, a price or an eligible discount line.
const resolveOrderLines = async (store, items) => {
  // First pass: resolve each basket item against server-owned catalogue data and
  // check stock. Pricing is deferred to a second pass because a quantity deal is
  // judged on the COMBINED quantity of a listing across all its variants/flavours
  // ("buy 3+ of any flavour"), not on a single line.
  const resolved = [];
  const qtyByListing = new Map();
  const settings = await getOrCreateSettings(store);
  for (const item of items) {
    if (
      !mongoose.isValidObjectId(item.listing) &&
      !mongoose.isValidObjectId(item.product)
    ) {
      throw requestError(400, "Invalid item reference");
    }
    const listing = mongoose.isValidObjectId(item.listing)
      ? await OnlineListing.findOne({ _id: item.listing, store, listed: true })
          .populate("product")
          .populate("variants.product")
      : await OnlineListing.findOne({
          product: item.product,
          store,
          listed: true,
        })
          .populate("product")
          .populate("variants.product");

    if (!listing || !listing.product) {
      throw requestError(404, "A product on this order is no longer available");
    }
    const qty = Number(item.quantity || 0);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw requestError(
        400,
        `Invalid quantity for ${listing.webName || listing.product.name}`,
      );
    }

    const variants = listing.variants || [];
    const selectedVariant = variants.length
      ? variants.find(
          (variant) =>
            variant.product &&
            String(variant.product._id) === String(item.product || ""),
        )
      : null;
    if (variants.length && !selectedVariant) {
      throw requestError(
        400,
        `Choose a valid option for ${listing.webName || listing.product.name}`,
      );
    }

    const selectedProduct = selectedVariant?.product || listing.product;
    if (
      !variants.length &&
      item.product &&
      String(item.product) !== String(listing.product._id)
    ) {
      throw requestError(
        400,
        `Invalid inventory item for ${listing.webName || listing.product.name}`,
      );
    }

    const lineName = selectedVariant?.label
      ? `${listing.webName || listing.product.name} — ${selectedVariant.label}`
      : listing.webName || listing.product.name;
    if (Number(selectedProduct.quantity) < qty) {
      throw requestError(
        409,
        `Only ${selectedProduct.quantity} left of ${lineName}`,
        {
          product: lineName,
          available: selectedProduct.quantity,
        },
      );
    }
    const key = String(listing._id);
    qtyByListing.set(key, (qtyByListing.get(key) || 0) + qty);
    resolved.push({
      listing,
      selectedProduct,
      selectedVariant,
      qty,
      lineName,
      eventPrice: eventPriceForItem(settings, listing._id, item),
    });
  }

  // Second pass: price each line. The deal price applies to every unit of a
  // listing once its combined quantity reaches the deal minimum.
  const lines = [];
  for (const r of resolved) {
    const listingQty = qtyByListing.get(String(r.listing._id)) || r.qty;
    const basePrice = money(
      effectiveItemPrice(r.listing, r.selectedProduct, r.selectedVariant, listingQty),
    );
    const price = r.eventPrice ? Math.min(r.eventPrice, basePrice) : basePrice;
    if (!Number.isFinite(price) || price <= 0) {
      throw requestError(
        409,
        `${r.lineName} is visible but its price still needs to be confirmed`,
        {
          product: r.lineName,
        },
      );
    }
    lines.push({
      listing: r.listing,
      product: r.selectedProduct,
      name: r.lineName,
      brand: r.listing.brand,
      price,
      quantity: r.qty,
      subtotal: money(price * r.qty),
      discount: 0,
      lineTotal: money(price * r.qty),
    });
  }
  return lines;
};

/* What the set offers on the website are worth to this basket.
 *
 * Shared by checkout and by the quote the shopper is shown before paying,
 * because the one thing worse than not offering a deal is offering it on the
 * basket page and not honouring it at the end.
 *
 * `room` is what is still discountable after the voucher has taken its
 * share; the deal can never reach past it. */
const dealsForBasket = async (settings, lines, room) => {
  const ids = eventDealIds(settings);
  if (!ids.length) return { discount: 0, applied: [] };

  // Read fresh rather than trusting the ids alone: a deal that has been
  // switched off or has run past its end date is no longer an offer, even
  // though the card advertising it is still on the page.
  const deals = await Deal.find({
    _id: { $in: ids },
    active: true,
    $or: [{ channel: "online" }, { channel: "both" }, { channel: { $exists: false } }],
  }).lean();
  return priceEventDeals(lines, deals, room);
};

const voucherEligibleLines = (voucher, lines) => {
  if (voucher.scope === "entire_order") return lines;
  const targetIds = new Set(
    (voucher.scope === "specific_products"
      ? voucher.listings
      : voucher.categories
    ).map(String),
  );
  return lines.filter((line) => {
    if (voucher.scope === "specific_products") {
      return targetIds.has(String(line.listing._id));
    }
    const listingCategories = [
      line.listing.category,
      ...(line.listing.categories || []),
    ]
      .filter(Boolean)
      .map(String);
    return listingCategories.some((id) => targetIds.has(id));
  });
};

const evaluateVoucher = async (voucher, lines, email = "") => {
  const now = new Date();
  if (!voucher || !voucher.active)
    throw requestError(400, "This voucher is not active");
  if (voucher.startsAt && voucher.startsAt > now) {
    throw requestError(400, "This voucher has not started yet");
  }
  if (voucher.endsAt && voucher.endsAt < now) {
    throw requestError(400, "This voucher has expired");
  }
  if (voucher.usageLimit != null && voucher.usedCount >= voucher.usageLimit) {
    throw requestError(409, "This voucher has reached its usage limit");
  }

  const subtotal = money(lines.reduce((sum, line) => sum + line.subtotal, 0));
  if (subtotal < Number(voucher.minSpend || 0)) {
    throw requestError(
      400,
      `Spend at least €${money(voucher.minSpend).toFixed(2)} to use this voucher`,
    );
  }
  if (voucher.perCustomerLimit && email) {
    const usedByCustomer = await OnlineOrder.countDocuments({
      store: voucher.store,
      "voucher.id": voucher._id,
      "customer.email": String(email).trim().toLowerCase(),
      status: { $nin: ["cancelled", "refunded"] },
    });
    if (usedByCustomer >= voucher.perCustomerLimit) {
      throw requestError(
        409,
        "This email address has already used this voucher",
      );
    }
  }

  const eligibleLines = voucherEligibleLines(voucher, lines);
  const eligibleSubtotal = money(
    eligibleLines.reduce((sum, line) => sum + line.subtotal, 0),
  );
  if (eligibleSubtotal <= 0) {
    throw requestError(
      400,
      "This voucher does not apply to the products in your basket",
    );
  }

  let discount =
    voucher.discountType === "percentage"
      ? money((eligibleSubtotal * Number(voucher.value)) / 100)
      : money(Number(voucher.value));
  if (voucher.maxDiscount != null)
    discount = Math.min(discount, Number(voucher.maxDiscount));
  discount = money(Math.min(discount, eligibleSubtotal));
  if (discount <= 0)
    throw requestError(400, "This voucher does not provide a discount");

  return { subtotal, eligibleLines, eligibleSubtotal, discount };
};

const allocateDiscount = (lines, eligibleLines, discount) => {
  const eligibleIds = new Set(eligibleLines.map((line) => line));
  const eligibleSubtotal = eligibleLines.reduce(
    (sum, line) => sum + line.subtotal,
    0,
  );
  let allocated = 0;
  const lastEligible = eligibleLines[eligibleLines.length - 1];
  for (const line of lines) {
    if (!eligibleIds.has(line)) {
      line.discount = 0;
      line.lineTotal = line.subtotal;
      continue;
    }
    const lineDiscount =
      line === lastEligible
        ? money(discount - allocated)
        : money((discount * line.subtotal) / eligibleSubtotal);
    line.discount = lineDiscount;
    line.lineTotal = money(line.subtotal - lineDiscount);
    allocated = money(allocated + lineDiscount);
  }
};

/* ───────────────────────────────────────── ADMIN — categories ───────────── */

module.exports.listCategories = async (req, res) => {
  try {
    const store = await storeId();
    const cats = await OnlineCategory.find({ store })
      .sort({ sortWeight: 1, name: 1 })
      .lean();
    const counts = await OnlineListing.aggregate([
      { $match: { store } },
      { $group: { _id: "$category", n: { $sum: 1 } } },
    ]);
    const byCat = new Map(counts.map((c) => [String(c._id), c.n]));
    return res.status(200).json({
      categories: cats.map((c) => ({
        ...c,
        listingCount: byCat.get(String(c._id)) || 0,
      })),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load categories", error: error.message });
  }
};

module.exports.createCategory = async (req, res) => {
  try {
    const store = await storeId();
    const {
      name,
      description = "",
      image = "",
      imageAlt = "",
      sortWeight = 0,
    } = req.body;
    if (!name?.trim())
      return res.status(400).json({ message: "Category name is required" });

    const slug = slugify(req.body.slug || name);
    const exists = await OnlineCategory.findOne({ store, slug });
    if (exists)
      return res
        .status(400)
        .json({ message: "A category with this slug already exists" });

    // Optional parent: must be a real category in this shop.
    let parent = null;
    if (req.body.parent) {
      if (!mongoose.isValidObjectId(req.body.parent))
        return res.status(400).json({ message: "Invalid parent category" });
      const parentCat = await OnlineCategory.findOne({
        _id: req.body.parent,
        store,
      }).select("_id");
      if (!parentCat)
        return res.status(400).json({ message: "Parent category not found" });
      parent = parentCat._id;
    }

    const category = await OnlineCategory.create({
      store,
      name: name.trim(),
      slug,
      description,
      image,
      imageAlt: String(imageAlt || name).trim().slice(0, 160),
      sortWeight,
      parent,
    });
    await logActivity({
      action: "Online Category Created",
      description: `Online category "${category.name}" added.`,
      entity: "onlineCategory",
      entityId: category._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });
    return res.status(201).json({ message: "Category created", category });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not create category", error: error.message });
  }
};

// All descendant category ids of `rootId` within a shop (children, grandchildren
// and deeper). Used to keep the parent hierarchy acyclic and to gather every
// product that sits under a parent category.
async function collectDescendantIds(store, rootId) {
  const all = await OnlineCategory.find({ store }).select("_id parent").lean();
  const childrenOf = new Map();
  for (const c of all) {
    const p = c.parent ? String(c.parent) : "";
    if (!childrenOf.has(p)) childrenOf.set(p, []);
    childrenOf.get(p).push(String(c._id));
  }
  const out = [];
  const stack = [...(childrenOf.get(String(rootId)) || [])];
  while (stack.length) {
    const id = stack.pop();
    out.push(id);
    for (const child of childrenOf.get(id) || []) stack.push(child);
  }
  return out;
}

module.exports.updateCategory = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid category id" });
    const store = await storeId();
    const updates = { ...req.body };
    if (updates.slug || updates.name)
      updates.slug = slugify(updates.slug || updates.name);
    delete updates.store;
    if (Object.prototype.hasOwnProperty.call(updates, "imageAlt")) {
      updates.imageAlt = String(updates.imageAlt || updates.name || "")
        .trim()
        .slice(0, 160);
    }

    // Re-parenting: validate the new parent and refuse any move that would form
    // a cycle (a category cannot become its own descendant, nor its own parent).
    if ("parent" in updates) {
      if (!updates.parent) {
        updates.parent = null;
      } else {
        if (!mongoose.isValidObjectId(updates.parent))
          return res.status(400).json({ message: "Invalid parent category" });
        if (String(updates.parent) === String(req.params.id))
          return res
            .status(400)
            .json({ message: "A category cannot be its own parent" });
        const parentCat = await OnlineCategory.findOne({
          _id: updates.parent,
          store,
        }).select("_id");
        if (!parentCat)
          return res.status(400).json({ message: "Parent category not found" });
        const descendants = await collectDescendantIds(store, req.params.id);
        if (descendants.includes(String(updates.parent)))
          return res.status(400).json({
            message: "Cannot nest a category under one of its own sub-categories",
          });
      }
    }

    const category = await OnlineCategory.findOneAndUpdate(
      { _id: req.params.id, store },
      updates,
      { new: true },
    );
    if (!category)
      return res.status(404).json({ message: "Category not found" });
    return res.status(200).json({ message: "Category updated", category });
  } catch (error) {
    // A rename whose slug already belongs to another category trips the unique
    // {store, slug} index. Answer with a clear message instead of a bare 500.
    if (error?.code === 11000) {
      return res.status(400).json({
        message:
          "Another category already uses this name — pick a different name.",
      });
    }
    return res
      .status(500)
      .json({ message: "Could not update category", error: error.message });
  }
};

module.exports.deleteCategory = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid category id" });
    const store = await storeId();

    // Don't strand listings: a category in use must be emptied first.
    const inUse = await OnlineListing.countDocuments({
      store,
      $or: [{ category: req.params.id }, { categories: req.params.id }],
    });
    if (inUse > 0) {
      return res.status(400).json({
        message: `${inUse} product(s) are still in this category — move them first, or switch the category off instead.`,
      });
    }

    // Don't orphan sub-categories: a parent must be emptied of children first.
    const childCount = await OnlineCategory.countDocuments({
      store,
      parent: req.params.id,
    });
    if (childCount > 0) {
      return res.status(400).json({
        message: `${childCount} sub-categor${childCount === 1 ? "y is" : "ies are"} still nested under this one — move or remove them first.`,
      });
    }

    const deleted = await OnlineCategory.findOneAndDelete({
      _id: req.params.id,
      store,
    });
    if (!deleted)
      return res.status(404).json({ message: "Category not found" });
    await logActivity({
      action: "Online Category Deleted",
      description: `Online category "${deleted.name}" removed.`,
      entity: "onlineCategory",
      entityId: deleted._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });
    return res.status(200).json({ message: "Category deleted" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not delete category", error: error.message });
  }
};

/* ───────────────────────────────────────── ADMIN — the picker ───────────── */

// Regex metacharacters in a search box would otherwise throw, or worse, build
// a pathological pattern.
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The catalogue as the "Add product" picker sees it: every product in the
 * inventory, searchable and filterable by its INVENTORY category, each marked
 * with whether it is already on the website.
 *
 * Paged deliberately — a shop with thousands of SKUs should not have to ship
 * the whole catalogue to the browser to add one product.
 */
module.exports.catalogue = async (req, res) => {
  try {
    const store = await storeId();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || 40, 100);
    const search = String(req.query.search || "").trim();

    const filter = {};
    if (mongoose.isValidObjectId(req.query.category))
      filter.Category = req.query.category;
    if (search) filter.name = { $regex: escapeRegex(search), $options: "i" };

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate("Category", "name")
        .select("name Price quantity image Category")
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    // Mark the ones already on the site so the picker can show it rather than
    // letting someone add the same product twice.
    const existing = await OnlineListing.find({
      store,
      product: { $in: products.map((p) => p._id) },
    })
      .select("product listed")
      .lean();
    const byProduct = new Map(existing.map((l) => [String(l.product), l]));

    return res.status(200).json({
      products: products.map((p) => ({
        ...p,
        onlineListing: byProduct.get(String(p._id))
          ? {
              id: String(byProduct.get(String(p._id))._id),
              listed: byProduct.get(String(p._id)).listed,
            }
          : null,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load the catalogue", error: error.message });
  }
};

/**
 * Mirror the inventory's categories into the online store in one go, so a shop
 * with fifty categories doesn't have to retype them. Existing online
 * categories are left alone — this only fills in what's missing.
 */
module.exports.importCategories = async (req, res) => {
  try {
    const store = await storeId();
    const Category = require("../models/ Categorymodel");
    const source = await Category.find({})
      .select("name description")
      .sort({ name: 1 })
      .lean();

    const have = await OnlineCategory.find({ store }).select("slug").lean();
    const haveSlugs = new Set(have.map((c) => c.slug));

    const toCreate = source
      .map((c) => ({
        store,
        name: c.name,
        slug: slugify(c.name),
        description: c.description || "",
      }))
      .filter((c) => c.slug && !haveSlugs.has(c.slug));

    if (toCreate.length === 0) {
      return res
        .status(200)
        .json({
          message:
            "Nothing new to import — every inventory category is already here.",
          created: 0,
        });
    }

    const created = await OnlineCategory.insertMany(toCreate, {
      ordered: false,
    });
    await logActivity({
      action: "Online Categories Imported",
      description: `${created.length} categories mirrored from inventory to the online store.`,
      entity: "onlineCategory",
      userId: req.user?._id,
      ipAddress: req.ip,
    });
    return res
      .status(201)
      .json({
        message: `${created.length} categories imported`,
        created: created.length,
        categories: created,
      });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not import categories", error: error.message });
  }
};

/**
 * Upload a picture for the ONLINE store. Deliberately its own Cloudinary
 * folder and its own record: web photography is styled differently from the
 * snapshot a till needs, and replacing one must never touch the other.
 */
module.exports.uploadListingImage = async (req, res) => {
  const uploaded = [];
  try {
    const files = Array.isArray(req.files)
      ? req.files
      : req.file
        ? [req.file]
        : [];
    if (files.length === 0)
      return res.status(400).json({ message: "No images were uploaded" });

    const { uploadImage } = require("../libs/cloudinaryImage");
    for (const file of files) {
      uploaded.push(await uploadImage(file, "online_store"));
    }
    return res.status(201).json({
      message: `${uploaded.length} image${uploaded.length === 1 ? "" : "s"} uploaded`,
      images: uploaded,
      image: uploaded[0],
    });
  } catch (error) {
    const { deleteImage } = require("../libs/cloudinaryImage");
    await Promise.allSettled(
      uploaded.map((image) => deleteImage(image.publicId)),
    );
    return res
      .status(500)
      .json({ message: "Image upload failed", error: error.message });
  }
};

// Create a brand-new inventory product straight from the online options editor,
// so an owner adding a flavour/colour the shop has never stocked doesn't have to
// leave for the inventory screen first. It writes a normal Product — the same
// row the till reads — optionally filed under an existing inventory category.
// Stock is shared from the moment it exists.
module.exports.createInventoryProduct = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const price = Number(req.body.price);
    const quantityRaw = req.body.quantity;
    const quantity =
      quantityRaw === "" || quantityRaw == null ? 0 : Number(quantityRaw);

    if (!name) {
      return res.status(400).json({ message: "Product name is required" });
    }
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ message: "Enter a valid price" });
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      return res.status(400).json({ message: "Enter a valid stock quantity" });
    }

    let categoryId = null;
    if (req.body.category) {
      if (!mongoose.isValidObjectId(req.body.category)) {
        return res.status(400).json({ message: "Invalid inventory category" });
      }
      const category = await Category.findById(req.body.category).select("_id");
      if (!category) {
        return res.status(400).json({ message: "Inventory category not found" });
      }
      categoryId = category._id;
    }

    const product = await Product.create({
      name,
      Price: money(price),
      quantity,
      ...(categoryId ? { Category: categoryId } : {}),
    });
    await product.populate("Category", "name");

    await logActivity({
      action: "Add Product",
      description: `Product ${name} created from the online store options editor.`,
      entity: "product",
      entityId: product._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    return res.status(201).json({ message: "Product created", product });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(400)
        .json({ message: "A product with that value already exists" });
    }
    return res
      .status(500)
      .json({ message: "Could not create the product", error: error.message });
  }
};

/* ───────────────────────────────────────── ADMIN — listings ─────────────── */

// The catalogue as the admin sees it: every product, with its listing state.
module.exports.listListings = async (req, res) => {
  try {
    const store = await storeId();
    const filter = { store };
    if (req.query.listed === "true") filter.listed = true;
    if (req.query.listed === "false") filter.listed = false;
    if (req.query.category && mongoose.isValidObjectId(req.query.category))
      filter.category = req.query.category;

    const listings = await OnlineListing.find(filter)
      .populate(
        "product",
        "name Price quantity barcode image lowStockThreshold",
      )
      .populate("variants.product", "name Price quantity barcode image")
      .populate({
        path: "linkedListings.listing",
        populate: [
          {
            path: "product",
            select: "name Price quantity barcode image lowStockThreshold",
          },
          { path: "variants.product", select: "name Price quantity barcode image" },
          { path: "category", select: "name slug" },
          { path: "categories", select: "name slug" },
        ],
      })
      .populate("category", "name slug")
      .populate("categories", "name slug")
      .sort({ sortWeight: 1, updatedAt: -1 })
      .limit(500)
      .lean();

    return res.status(200).json({
      listings,
      counts: {
        total: await OnlineListing.countDocuments({ store }),
        listed: await OnlineListing.countDocuments({ store, listed: true }),
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load listings", error: error.message });
  }
};

// Put an inventory product on the website (or update how it appears).
module.exports.upsertListing = async (req, res) => {
  try {
    const store = await storeId();
    const { product: productId } = req.body;
    if (!mongoose.isValidObjectId(productId))
      return res.status(400).json({ message: "Invalid product id" });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const base = slugify(req.body.slug || req.body.webName || product.name);
    // Slugs are URLs; make a collision unique rather than rejecting the save.
    let slug = base || String(product._id);
    const clash = await OnlineListing.findOne({
      store,
      slug,
      product: { $ne: product._id },
    });
    if (clash) slug = `${slug}-${String(product._id).slice(-4)}`;

    const wantsListed =
      req.body.listed !== undefined ? Boolean(req.body.listed) : false;
    let category = null;
    if (req.body.category) {
      if (!mongoose.isValidObjectId(req.body.category)) {
        return res.status(400).json({ message: "Invalid online category" });
      }
      category = await OnlineCategory.findOne({
        _id: req.body.category,
        store,
      });
      if (!category) {
        return res
          .status(400)
          .json({ message: "Online category does not belong to this store" });
      }
    }
    if (wantsListed && !category) {
      return res
        .status(400)
        .json({ message: "Choose an online category before publishing" });
    }

    const gallery = Array.isArray(req.body.gallery)
      ? req.body.gallery
          .filter(
            (image) =>
              image && typeof image.url === "string" && image.url.trim(),
          )
          .slice(0, 8)
          .map((image) => ({
            url: image.url.trim(),
            publicId:
              typeof image.publicId === "string" ? image.publicId.trim() : "",
            alt:
              typeof image.alt === "string" ? image.alt.trim() : product.name,
          }))
      : [];

      const fields = {
      store,
      product: product._id,
      slug,
      category: category?._id || null,
      categories: category ? [category._id] : [],
      listed: wantsListed,
      webName: req.body.webName ?? product.name,
      brand: req.body.brand ?? "",
      shortDescription: req.body.shortDescription ?? "",
      description: req.body.description ?? "",
      gallery,
      catalogImage:
        req.body.catalogImage && typeof req.body.catalogImage === "object"
          ? {
              url:
                typeof req.body.catalogImage.url === "string"
                  ? req.body.catalogImage.url.trim()
                  : "",
              publicId:
                typeof req.body.catalogImage.publicId === "string"
                  ? req.body.catalogImage.publicId.trim()
                  : "",
              alt:
                typeof req.body.catalogImage.alt === "string"
                  ? req.body.catalogImage.alt.trim()
                  : product.name,
            }
          : { url: "", publicId: "", alt: "" },
      specs:
        req.body.specs && typeof req.body.specs === "object"
          ? req.body.specs
          : {},
      flavour: req.body.flavour ?? "",
      optionLabel: req.body.optionLabel ?? "",
      variantLabel: req.body.variantLabel ?? "",
      selfVariantLabel: req.body.selfVariantLabel ?? "",
      tags: Array.isArray(req.body.tags) ? req.body.tags : [],
      priceOverride:
        req.body.priceOverride === "" || req.body.priceOverride == null
          ? null
          : Number(req.body.priceOverride),
      compareAtPrice:
        req.body.compareAtPrice === "" || req.body.compareAtPrice == null
          ? null
          : Number(req.body.compareAtPrice),
      salePrice:
        req.body.salePrice === "" || req.body.salePrice == null
          ? null
          : Number(req.body.salePrice),
      saleStartsAt: req.body.saleStartsAt
        ? new Date(req.body.saleStartsAt)
        : null,
      saleEndsAt: req.body.saleEndsAt ? new Date(req.body.saleEndsAt) : null,
      seo: req.body.seo || { title: "", description: "" },
      featured: Boolean(req.body.featured),
      sortWeight: Number(req.body.sortWeight || 0),
    };

    const listing = await OnlineListing.findOneAndUpdate(
      { store, product: product._id },
      { $set: fields },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).populate("product", "name Price quantity image");

    await logActivity({
      action: "Online Listing Saved",
      description: `${product.name} ${fields.listed ? "listed on" : "saved for"} the online store.`,
      entity: "onlineListing",
      entityId: listing._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    emit(req, "onlineListingChanged", {
      listingId: String(listing._id),
      listed: listing.listed,
    });
    return res.status(200).json({ message: "Listing saved", listing });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not save listing", error: error.message });
  }
};

// Edit only the storefront layer. Product.Price and Product.quantity are
// intentionally absent from the allow-list below.
module.exports.updateListing = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid listing id" });
    }
    const store = await storeId();
    const listing = await OnlineListing.findOne({
      _id: req.params.id,
      store,
    }).populate("product", "name Price quantity image");
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    if (Object.prototype.hasOwnProperty.call(req.body, "category")) {
      if (!mongoose.isValidObjectId(req.body.category)) {
        return res
          .status(400)
          .json({ message: "Choose a valid online category" });
      }
      const category = await OnlineCategory.findOne({
        _id: req.body.category,
        store,
      });
      if (!category) {
        return res
          .status(400)
          .json({ message: "Online category does not belong to this store" });
      }
      listing.category = category._id;
      const categoryIds = new Set((listing.categories || []).map(String));
      categoryIds.add(String(category._id));
      listing.categories = [...categoryIds];
    }

    // Full multi-category membership. The product shows on every one of these
    // category pages; the primary `category` above is always included.
    if (Object.prototype.hasOwnProperty.call(req.body, "categories")) {
      const requested = Array.isArray(req.body.categories) ? req.body.categories : [];
      const valid = await OnlineCategory.find({
        _id: { $in: requested.filter((id) => mongoose.isValidObjectId(id)) },
        store,
      }).select("_id");
      const ids = new Set(valid.map((c) => String(c._id)));
      if (listing.category) ids.add(String(listing.category));
      listing.categories = [...ids];
      if (!listing.category && listing.categories.length) {
        listing.category = listing.categories[0];
      }
    }

    const textFields = [
      "webName",
      "brand",
      "shortDescription",
      "description",
      "flavour",
      "optionLabel",
      "variantLabel",
      "selfVariantLabel",
    ];
    for (const key of textFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        listing[key] = String(req.body[key] || "").trim();
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "slug")) {
      const slug = slugify(
        req.body.slug || listing.webName || listing.product?.name,
      );
      if (!slug)
        return res
          .status(400)
          .json({ message: "The product URL cannot be blank" });
      const clash = await OnlineListing.exists({
        store,
        slug,
        _id: { $ne: listing._id },
      });
      if (clash)
        return res
          .status(409)
          .json({ message: "That product URL is already in use" });
      listing.slug = slug;
    }

    const nullablePrice = (key) => {
      if (!Object.prototype.hasOwnProperty.call(req.body, key)) return;
      const raw = req.body[key];
      if (raw === "" || raw == null) {
        listing[key] = null;
        return;
      }
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        throw Object.assign(
          new Error(`${key} must be a valid positive amount`),
          {
            statusCode: 400,
          },
        );
      }
      listing[key] = money(value);
    };
    nullablePrice("priceOverride");
    nullablePrice("compareAtPrice");
    nullablePrice("salePrice");
    if (listing.salePrice != null && listing.salePrice <= 0) {
      return res
        .status(400)
        .json({ message: "A sale price must be greater than zero" });
    }
    const regularPrice = Number(
      listing.priceOverride ?? listing.product?.Price ?? 0,
    );
    if (
      listing.salePrice != null &&
      regularPrice > 0 &&
      listing.salePrice >= regularPrice
    ) {
      return res.status(400).json({
        message: `Sale price must be lower than the regular online price (€${money(regularPrice).toFixed(2)})`,
      });
    }

    for (const key of ["saleStartsAt", "saleEndsAt"]) {
      if (!Object.prototype.hasOwnProperty.call(req.body, key)) continue;
      if (!req.body[key]) {
        listing[key] = null;
      } else {
        const date = new Date(req.body[key]);
        if (Number.isNaN(date.getTime())) {
          return res
            .status(400)
            .json({ message: `${key} is not a valid date` });
        }
        listing[key] = date;
      }
    }
    if (
      listing.saleStartsAt &&
      listing.saleEndsAt &&
      listing.saleEndsAt <= listing.saleStartsAt
    ) {
      return res
        .status(400)
        .json({ message: "Sale end time must be after its start time" });
    }

    // Quantity-triggered deal: the sale price only applies from this quantity up.
    // Empty / null / 1 stores as null (an ordinary sale on every unit).
    if (Object.prototype.hasOwnProperty.call(req.body, "dealMinQty")) {
      const raw = req.body.dealMinQty;
      if (raw === "" || raw == null) {
        listing.dealMinQty = null;
      } else {
        const n = Math.floor(Number(raw));
        if (!Number.isFinite(n) || n < 1) {
          return res
            .status(400)
            .json({ message: "Minimum deal quantity must be a whole number of 1 or more" });
        }
        listing.dealMinQty = n <= 1 ? null : n;
      }
    }

    // Optional promo image for the deal. An empty payload clears it.
    if (Object.prototype.hasOwnProperty.call(req.body, "dealImage")) {
      const img = req.body.dealImage;
      listing.dealImage =
        img && typeof img.url === "string" && img.url.trim()
          ? {
              url: img.url.trim(),
              publicId:
                typeof img.publicId === "string" ? img.publicId.trim() : "",
              alt:
                typeof img.alt === "string" && img.alt.trim()
                  ? img.alt.trim().slice(0, 160)
                  : listing.webName || listing.product?.name || "",
            }
          : { url: "", publicId: "", alt: "" };
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "tags")) {
      const allowedTags = new Set(["new", "bestseller", "sale", "limited", "hot"]);
      listing.tags = Array.from(
        new Set(
          (Array.isArray(req.body.tags) ? req.body.tags : []).filter((tag) =>
            allowedTags.has(tag),
          ),
        ),
      );
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "featured")) {
      listing.featured = Boolean(req.body.featured);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "listed")) {
      if (req.body.listed && !listing.category) {
        return res
          .status(400)
          .json({ message: "Choose an online category before publishing" });
      }
      listing.listed = Boolean(req.body.listed);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "sortWeight")) {
      listing.sortWeight = Number(req.body.sortWeight || 0);
    }

    // Web gallery. Editable after creation so the shop can add, swap or remove
    // photography without recreating the listing. Presentation only — never
    // touches the linked Product.
    if (Object.prototype.hasOwnProperty.call(req.body, "gallery")) {
      const fallbackAlt = listing.webName || listing.product?.name || "";
      listing.gallery = (Array.isArray(req.body.gallery) ? req.body.gallery : [])
        .filter(
          (image) => image && typeof image.url === "string" && image.url.trim(),
        )
        .slice(0, 8)
        .map((image) => ({
          url: image.url.trim(),
          publicId:
            typeof image.publicId === "string" ? image.publicId.trim() : "",
          alt: typeof image.alt === "string" && image.alt.trim()
            ? image.alt.trim()
            : fallbackAlt,
        }));
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "catalogImage")) {
      const image =
        req.body.catalogImage && typeof req.body.catalogImage === "object"
          ? req.body.catalogImage
          : {};
      const fallbackAlt = listing.webName || listing.product?.name || "";
      listing.catalogImage = {
        url: typeof image.url === "string" ? image.url.trim() : "",
        publicId:
          typeof image.publicId === "string" ? image.publicId.trim() : "",
        alt:
          typeof image.alt === "string" && image.alt.trim()
            ? image.alt.trim()
            : fallbackAlt,
      };
    }

    // Options — flavours / colours. Each option points at a REAL inventory
    // Product that owns its stock, so selling an option decrements that Product
    // (never the parent placeholder) exactly like the till. We validate that
    // every referenced product exists and that no two options share one SKU.
    if (Object.prototype.hasOwnProperty.call(req.body, "variants")) {
      const raw = Array.isArray(req.body.variants) ? req.body.variants : [];
      if (raw.length > 200) {
        return res
          .status(400)
          .json({ message: "A product can have at most 200 options" });
      }
      const seen = new Set();
      const normalised = [];
      for (const entry of raw) {
        const productId = entry?.product?._id || entry?.product;
        if (!mongoose.isValidObjectId(productId)) {
          return res.status(400).json({
            message: "Each option must be linked to an inventory product",
          });
        }
        const key = String(productId);
        if (seen.has(key)) {
          return res.status(400).json({
            message: "Each option must use a different inventory product",
          });
        }
        const label = String(entry.label || "").trim();
        if (!label) {
          return res.status(400).json({
            message: "Every option needs a name (e.g. a flavour or colour)",
          });
        }
        let priceOverride = null;
        if (entry.priceOverride !== "" && entry.priceOverride != null) {
          const value = Number(entry.priceOverride);
          if (!Number.isFinite(value) || value < 0) {
            return res
              .status(400)
              .json({ message: `Invalid price for option "${label}"` });
          }
          priceOverride = money(value);
        }
        const kind = ["flavour", "colour", "option"].includes(entry.kind)
          ? entry.kind
          : "option";
        seen.add(key);
        normalised.push({
          product: productId,
          label: label.slice(0, 120),
          kind,
          image: typeof entry.image === "string" ? entry.image.trim() : "",
          imageAlt:
            typeof entry.imageAlt === "string" && entry.imageAlt.trim()
              ? entry.imageAlt.trim().slice(0, 160)
              : label,
          priceOverride,
          externalId:
            typeof entry.externalId === "string" ? entry.externalId.trim() : "",
        });
      }
      if (normalised.length) {
        const ids = normalised.map((variant) => variant.product);
        const found = await Product.countDocuments({ _id: { $in: ids } });
        if (found !== ids.length) {
          return res.status(400).json({
            message: "An option references a product that no longer exists",
          });
        }
      }
      listing.variants = normalised;
    }

    // Linked product variants — whole online listings shown as product-family
    // options (e.g. 2ml / 3ml). Each linked listing keeps its own flavours,
    // prices and stock rules; checkout still receives the selected child
    // listing/product, so no inventory duplication is introduced.
    if (Object.prototype.hasOwnProperty.call(req.body, "linkedListings")) {
      const raw = Array.isArray(req.body.linkedListings)
        ? req.body.linkedListings
        : [];
      if (raw.length > 24) {
        return res
          .status(400)
          .json({ message: "A product can have at most 24 linked product variants" });
      }
      const seen = new Set();
      const normalised = [];
      for (const entry of raw) {
        const listingId = entry?.listing?._id || entry?.listing;
        if (!mongoose.isValidObjectId(listingId)) {
          return res.status(400).json({
            message: "Each product variant must link to an online listing",
          });
        }
        const key = String(listingId);
        if (key === String(listing._id)) {
          return res.status(400).json({
            message: "A product cannot be linked to itself as a variant",
          });
        }
        if (seen.has(key)) {
          return res.status(400).json({
            message: "Each linked product variant must be different",
          });
        }
        const label = String(entry.label || "").trim();
        if (!label) {
          return res.status(400).json({
            message: "Every linked product variant needs a display name",
          });
        }
        seen.add(key);
        normalised.push({
          listing: listingId,
          label: label.slice(0, 120),
          image: typeof entry.image === "string" ? entry.image.trim() : "",
          imageAlt:
            typeof entry.imageAlt === "string" && entry.imageAlt.trim()
              ? entry.imageAlt.trim().slice(0, 160)
              : label,
          sortWeight: Number(entry.sortWeight || 0),
        });
      }
      if (normalised.length) {
        const ids = normalised.map((link) => link.listing);
        const found = await OnlineListing.countDocuments({
          _id: { $in: ids },
          store,
        });
        if (found !== ids.length) {
          return res.status(400).json({
            message: "A linked product variant no longer belongs to this store",
          });
        }
      }
      listing.linkedListings = normalised;
    }

    // Optional bulk override for Shopify options. Still writes only listing
    // presentation, never the linked Product.Price.
    if (req.body.applyPriceToVariants && listing.variants?.length) {
      const override =
        listing.priceOverride == null ? null : money(listing.priceOverride);
      for (const variant of listing.variants) variant.priceOverride = override;
    }

    await listing.save();
    await listing.populate([
      {
        path: "product",
        select: "name Price quantity barcode image lowStockThreshold",
      },
      { path: "variants.product", select: "name Price quantity barcode image" },
      {
        path: "linkedListings.listing",
        populate: [
          {
            path: "product",
            select: "name Price quantity barcode image lowStockThreshold",
          },
          { path: "variants.product", select: "name Price quantity barcode image" },
          { path: "category", select: "name slug" },
          { path: "categories", select: "name slug" },
        ],
      },
      { path: "category", select: "name slug" },
      { path: "categories", select: "name slug" },
    ]);

    await logActivity({
      action: "Online Listing Updated",
      description: `${listing.webName || listing.product?.name} website details updated; inventory price unchanged.`,
      entity: "onlineListing",
      entityId: listing._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });
    emit(req, "onlineListingChanged", {
      listingId: String(listing._id),
      listed: listing.listed,
    });
    return res.status(200).json({
      message:
        "Online product updated. Inventory and POS price were not changed.",
      listing,
    });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({
        message: error.statusCode ? error.message : "Could not update listing",
        error: error.message,
      });
  }
};

// The switch the owner actually reaches for.
/* Set one quantity across a listing's flavours — but only the placeholders.
 *
 * A brand like VELO sells ten flavours online while the shop keeps a real count
 * of two of them. Typing the figure ten times is the sort of chore that ends in
 * a typo, so this writes it once. What it must never do is flatten a number
 * somebody maintains: those variants are skipped and named back to the caller.
 *
 * The test is `stockCounted`, NOT "has a barcode". A barcode is a label; it
 * promises nothing about whether the count is true, and an item can be properly
 * counted without ever carrying one.
 *
 * The figure is PER VARIANT, deliberately. "VELO: 15" across eight flavours
 * would let the website sell 120 units — the route says `quantity` and the UI
 * says "per variant" so nobody reads it as a total.
 */
module.exports.bulkVariantQuantity = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid listing id" });

    const quantity = Math.floor(Number(req.body.quantity));
    if (!Number.isFinite(quantity) || quantity < 0)
      return res.status(400).json({ message: "Enter a quantity of 0 or more" });

    const store = await storeId();
    const listing = await OnlineListing.findOne({ _id: req.params.id, store })
      .populate("product", "name barcode stockCounted")
      .populate("variants.product", "name barcode stockCounted");
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const slots = (listing.variants || [])
      .filter((variant) => variant.product)
      .map((variant) => ({ label: variant.label || "", product: variant.product }));
    const rows = slots.length
      ? slots
      : listing.product
        ? [{ label: "", product: listing.product }]
        : [];

    if (!rows.length)
      return res.status(400).json({ message: "This listing has nothing to stock" });

    const applied = [];
    const skipped = [];
    for (const row of rows) {
      if (row.product.stockCounted) {
        skipped.push(row.label || row.product.name);
      } else {
        applied.push(row.product._id);
      }
    }

    if (applied.length) {
      await Product.updateMany(
        { _id: { $in: applied } },
        { $set: { quantity, updatedAt: new Date() } },
      );
      // Same event the till and the website already listen to.
      emitStockChanged(
        req,
        applied.map((id) => ({ product: id, quantity })),
        `Bulk stock on ${listing.webName || listing.slug}`,
      );
    }

    await logActivity({
      action: "Online Listing Bulk Stock",
      description: `${listing.webName || listing.slug}: ${applied.length} variant(s) set to ${quantity}${
        skipped.length ? `, ${skipped.length} left alone (counted stock)` : ""
      }.`,
      entity: "onlineListing",
      entityId: listing._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    return res.status(200).json({
      message: `${applied.length} variant(s) set to ${quantity} each`,
      quantity,
      applied: applied.length,
      skipped,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not set stock", error: error.message });
  }
};

module.exports.toggleListing = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid listing id" });
    const store = await storeId();
    const listing = await OnlineListing.findOne({ _id: req.params.id, store });
    if (!listing) return res.status(404).json({ message: "Listing not found" });

    const nextListed =
      req.body.listed !== undefined
        ? Boolean(req.body.listed)
        : !listing.listed;
    if (nextListed && !listing.category) {
      return res
        .status(400)
        .json({ message: "Choose an online category before publishing" });
    }
    listing.listed = nextListed;
    await listing.save();

    emit(req, "onlineListingChanged", {
      listingId: String(listing._id),
      listed: listing.listed,
    });
    return res
      .status(200)
      .json({
        message: listing.listed
          ? "Product is live"
          : "Product removed from the store",
        listing,
      });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not update listing", error: error.message });
  }
};

module.exports.deleteListing = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid listing id" });
    const store = await storeId();
    // Removing a listing only takes the product off the WEBSITE. The product
    // and its stock stay exactly where they are.
    const deleted = await OnlineListing.findOneAndDelete({
      _id: req.params.id,
      store,
    });
    if (!deleted) return res.status(404).json({ message: "Listing not found" });
    emit(req, "onlineListingChanged", {
      listingId: String(deleted._id),
      listed: false,
    });
    return res.status(200).json({ message: "Removed from the online store" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not remove listing", error: error.message });
  }
};

/* ───────────────────────────────────────── ADMIN — hero slides ──────────── */

/* ADMIN — vouchers and store settings */

const voucherFields = async (body, store, current = {}) => {
  const valueOf = (key, fallback) =>
    Object.prototype.hasOwnProperty.call(body, key) ? body[key] : fallback;
  const code = String(valueOf("code", current.code || ""))
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) {
    throw requestError(
      400,
      "Voucher code must be 3–40 letters, numbers, dashes or underscores",
    );
  }
  const discountType = valueOf(
    "discountType",
    current.discountType || "percentage",
  );
  if (!["percentage", "fixed"].includes(discountType)) {
    throw requestError(400, "Choose percentage or fixed discount");
  }
  const value = Number(valueOf("value", current.value));
  if (!Number.isFinite(value) || value <= 0) {
    throw requestError(400, "Voucher value must be greater than zero");
  }
  if (discountType === "percentage" && value > 100) {
    throw requestError(400, "Percentage discount cannot be more than 100%");
  }

  const numberOrNull = (key, fallback, { min = 0 } = {}) => {
    const raw = valueOf(key, fallback);
    if (raw === "" || raw == null) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < min) {
      throw requestError(400, `${key} must be at least ${min}`);
    }
    return parsed;
  };
  const dateOrNull = (key, fallback) => {
    const raw = valueOf(key, fallback);
    if (!raw) return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime()))
      throw requestError(400, `${key} is not a valid date`);
    return date;
  };

  const scope = valueOf("scope", current.scope || "entire_order");
  if (
    !["entire_order", "specific_products", "specific_categories"].includes(
      scope,
    )
  ) {
    throw requestError(400, "Choose a valid voucher scope");
  }
  const listings = Array.from(
    new Set(
      (valueOf("listings", current.listings || []) || []).map((id) =>
        String(id?._id || id),
      ),
    ),
  );
  const categories = Array.from(
    new Set(
      (valueOf("categories", current.categories || []) || []).map((id) =>
        String(id?._id || id),
      ),
    ),
  );
  if (listings.some((id) => !mongoose.isValidObjectId(id))) {
    throw requestError(400, "One of the selected products is invalid");
  }
  if (categories.some((id) => !mongoose.isValidObjectId(id))) {
    throw requestError(400, "One of the selected categories is invalid");
  }
  if (scope === "specific_products") {
    if (!listings.length)
      throw requestError(400, "Select at least one product for this voucher");
    const count = await OnlineListing.countDocuments({
      store,
      _id: { $in: listings },
    });
    if (count !== listings.length)
      throw requestError(400, "A selected product is not in this store");
  }
  if (scope === "specific_categories") {
    if (!categories.length)
      throw requestError(400, "Select at least one category for this voucher");
    const count = await OnlineCategory.countDocuments({
      store,
      _id: { $in: categories },
    });
    if (count !== categories.length)
      throw requestError(400, "A selected category is not in this store");
  }

  const startsAt = dateOrNull("startsAt", current.startsAt);
  const endsAt = dateOrNull("endsAt", current.endsAt);
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw requestError(400, "Voucher end time must be after its start time");
  }

  return {
    code,
    name: String(valueOf("name", current.name || code)).trim() || code,
    description: String(
      valueOf("description", current.description || ""),
    ).trim(),
    discountType,
    value: money(value),
    minSpend: money(numberOrNull("minSpend", current.minSpend) || 0),
    maxDiscount: numberOrNull("maxDiscount", current.maxDiscount),
    scope,
    listings: scope === "specific_products" ? listings : [],
    categories: scope === "specific_categories" ? categories : [],
    startsAt,
    endsAt,
    usageLimit: numberOrNull("usageLimit", current.usageLimit, { min: 1 }),
    perCustomerLimit: numberOrNull(
      "perCustomerLimit",
      current.perCustomerLimit,
      { min: 1 },
    ),
    active: Boolean(valueOf("active", current.active ?? true)),
  };
};

module.exports.listVouchers = async (req, res) => {
  try {
    const store = await storeId();
    const vouchers = await OnlineVoucher.find({ store })
      .populate("listings", "webName slug")
      .populate("categories", "name slug")
      .sort({ active: -1, createdAt: -1 })
      .lean();
    return res.status(200).json({ vouchers });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load vouchers", error: error.message });
  }
};

module.exports.createVoucher = async (req, res) => {
  try {
    const store = await storeId();
    const fields = await voucherFields(req.body, store);
    const voucher = await OnlineVoucher.create({
      ...fields,
      store,
      createdBy: req.user?._id,
      updatedBy: req.user?._id,
    });
    return res.status(201).json({ message: "Voucher created", voucher });
  } catch (error) {
    const duplicate = error?.code === 11000;
    return res.status(duplicate ? 409 : error.statusCode || 500).json({
      message: duplicate
        ? "That voucher code already exists"
        : error.statusCode
          ? error.message
          : "Could not create voucher",
      error: error.message,
    });
  }
};

module.exports.updateVoucher = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid voucher id" });
    }
    const store = await storeId();
    const voucher = await OnlineVoucher.findOne({ _id: req.params.id, store });
    if (!voucher) return res.status(404).json({ message: "Voucher not found" });
    const fields = await voucherFields(req.body, store, voucher.toObject());
    Object.assign(voucher, fields, { updatedBy: req.user?._id });
    await voucher.save();
    return res.status(200).json({ message: "Voucher updated", voucher });
  } catch (error) {
    const duplicate = error?.code === 11000;
    return res.status(duplicate ? 409 : error.statusCode || 500).json({
      message: duplicate
        ? "That voucher code already exists"
        : error.statusCode
          ? error.message
          : "Could not update voucher",
      error: error.message,
    });
  }
};

module.exports.deleteVoucher = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid voucher id" });
    }
    const store = await storeId();
    const voucher = await OnlineVoucher.findOne({ _id: req.params.id, store });
    if (!voucher) return res.status(404).json({ message: "Voucher not found" });
    if (voucher.usedCount > 0) {
      voucher.active = false;
      await voucher.save();
      return res.status(200).json({
        message:
          "Used vouchers are retained for audit; this voucher was disabled.",
        voucher,
      });
    }
    await voucher.deleteOne();
    return res.status(200).json({ message: "Voucher deleted" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not delete voucher", error: error.message });
  }
};

const SOCIAL_HOSTS = {
  instagram: ["instagram.com"],
  facebook: ["facebook.com", "fb.com"],
  twitter: ["x.com", "twitter.com"],
  tiktok: ["tiktok.com"],
};

const socialUrl = (platform, raw) => {
  const value = String(raw || "").trim();
  if (!value) return "";
  let parsed;
  try {
    parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    throw requestError(400, `Enter a valid ${platform} URL`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw requestError(400, `Enter a valid ${platform} web URL`);
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (
    !SOCIAL_HOSTS[platform].some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    )
  ) {
    throw requestError(
      400,
      `The ${platform} link must point to ${SOCIAL_HOSTS[platform][0]}`,
    );
  }
  return parsed.toString();
};

const FOOTER_LINK_KEYS = [
  "contact",
  "terms",
  "privacy",
  "refunds",
  "about",
  "bestSellers",
  "whyECigarettes",
  "deals",
  "blog",
];

const safeFooterHref = (raw) => {
  const value = String(raw || "").trim().slice(0, 500);
  if (!value) return "";
  if (/^(\/(?!\/)|#|https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  throw requestError(400, "Footer links must use /, #, http(s), mailto or tel URLs");
};

const getOrCreateSettings = (store) =>
  OnlineStoreSetting.findOneAndUpdate(
    { store },
    { $setOnInsert: { store } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

module.exports.getStoreSettings = async (req, res) => {
  try {
    const store = await storeId();
    return res.status(200).json({ settings: await getOrCreateSettings(store) });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load store settings", error: error.message });
  }
};

module.exports.updateStoreSettings = async (req, res) => {
  try {
    const store = await storeId();
    const settings = await getOrCreateSettings(store);
    if (Object.prototype.hasOwnProperty.call(req.body, "logo")) {
      settings.logo = String(req.body.logo || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "logoAlt")) {
      settings.logoAlt = String(req.body.logoAlt || "").trim().slice(0, 160);
    }
    const social = req.body.social || {};
    for (const platform of Object.keys(SOCIAL_HOSTS)) {
      if (Object.prototype.hasOwnProperty.call(social, platform)) {
        settings.social[platform] = socialUrl(platform, social[platform]);
      }
    }
    const footer = req.body.footer || {};
    for (const key of [
      "newsletterHeading",
      "description",
      "supportEmail",
      "supportPhone",
      "address",
      "openingHours",
      "paymentImage",
      "restrictionImage",
      "paymentImageAlt",
      "restrictionImageAlt",
      "whyECigarettesTitle",
      "whyECigarettesContent",
    ]) {
      if (Object.prototype.hasOwnProperty.call(footer, key)) {
        settings.footer[key] = String(footer[key] || "").trim();
      }
    }
    settings.markModified("footer");
    const footerLinks = req.body.footerLinks || {};
    if (!settings.footerLinks) settings.footerLinks = {};
    for (const key of FOOTER_LINK_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(footerLinks, key)) continue;
      const incoming = footerLinks[key] || {};
      if (!settings.footerLinks[key]) settings.footerLinks[key] = {};
      if (Object.prototype.hasOwnProperty.call(incoming, "enabled")) {
        settings.footerLinks[key].enabled = Boolean(incoming.enabled);
      }
      if (Object.prototype.hasOwnProperty.call(incoming, "label")) {
        settings.footerLinks[key].label = String(incoming.label || "")
          .trim()
          .slice(0, 80);
      }
      if (Object.prototype.hasOwnProperty.call(incoming, "href")) {
        settings.footerLinks[key].href = safeFooterHref(incoming.href);
      }
    }
    settings.markModified("footerLinks");
    const announcement = req.body.announcement || {};
    if (!settings.announcement) settings.announcement = {};
    if (Object.prototype.hasOwnProperty.call(announcement, "enabled")) {
      settings.announcement.enabled = Boolean(announcement.enabled);
    }
    for (const key of ["primary", "secondary"]) {
      if (Object.prototype.hasOwnProperty.call(announcement, key)) {
        settings.announcement[key] = String(announcement[key] || "").trim();
      }
    }
    const emergencyAlert = req.body.emergencyAlert || {};
    if (!settings.emergencyAlert) settings.emergencyAlert = {};
    if (Object.prototype.hasOwnProperty.call(emergencyAlert, "active")) {
      settings.emergencyAlert.active = Boolean(emergencyAlert.active);
    }
    for (const key of ["title", "message", "buttonLabel"]) {
      if (Object.prototype.hasOwnProperty.call(emergencyAlert, key)) {
        settings.emergencyAlert[key] = String(emergencyAlert[key] || "").trim();
      }
    }
    if (Object.prototype.hasOwnProperty.call(emergencyAlert, "tone")) {
      const tone = String(emergencyAlert.tone || "maintenance");
      settings.emergencyAlert.tone = ["maintenance", "warning", "info"].includes(tone)
        ? tone
        : "maintenance";
    }
    settings.markModified("emergencyAlert");
    const shipping = req.body.shipping || {};
    if (!settings.shipping) settings.shipping = {};
    for (const key of ["flatRate", "freeThreshold"]) {
      if (Object.prototype.hasOwnProperty.call(shipping, key)) {
        settings.shipping[key] = Math.max(0, Number(shipping[key]) || 0);
      }
    }
    settings.markModified("shipping");
    const promises = req.body.promises || {};
    // `promises` is a newer field: on settings docs created before it existed it
    // is only a hydrated default, so ensure the object is real before writing.
    if (!settings.promises) settings.promises = {};
    for (const [key, maxLength] of [
      ["dispatch", 40],
      ["authenticLabel", 40],
    ]) {
      if (Object.prototype.hasOwnProperty.call(promises, key)) {
        settings.promises[key] = String(promises[key] || "")
          .trim()
          .slice(0, maxLength);
      }
    }
    if (Object.prototype.hasOwnProperty.call(promises, "returnsDays")) {
      settings.promises.returnsDays = Math.max(
        0,
        Math.min(365, Math.round(Number(promises.returnsDays) || 0)),
      );
    }
    if (Object.prototype.hasOwnProperty.call(promises, "authentic")) {
      settings.promises.authentic = Boolean(promises.authentic);
    }
    // Mongoose doesn't reliably flag sub-path edits on a defaulted nested
    // object; mark it so the whole `promises` object is actually persisted.
    settings.markModified("promises");
    settings.events = settings.events || {};
    const events = req.body.events || {};
    if (Object.prototype.hasOwnProperty.call(events, "enabled")) {
      settings.events.enabled = Boolean(events.enabled);
    }
    if (Object.prototype.hasOwnProperty.call(events, "heading")) {
      settings.events.heading = String(events.heading || "").trim().slice(0, 140);
    }
    if (Object.prototype.hasOwnProperty.call(events, "headingImage")) {
      // A picture in place of the heading. Sent as null (or with no url) to
      // take it off, which puts the text heading back — the words are kept
      // either way as the image's alt text.
      const image = events.headingImage || {};
      settings.events.headingImage = {
        url: String(image.url || "").trim().slice(0, 500),
        publicId: String(image.publicId || "").trim().slice(0, 200),
        alt: String(image.alt || settings.events.heading || "")
          .trim()
          .slice(0, 160),
      };
    }
    if (Object.prototype.hasOwnProperty.call(events, "align")) {
      settings.events.align = ["left", "center", "right"].includes(events.align)
        ? events.align
        : "center";
    }
    if (Object.prototype.hasOwnProperty.call(events, "items")) {
      settings.events.items = (Array.isArray(events.items) ? events.items : [])
        .slice(0, 3)
        .map((item) => ({
          enabled: Boolean(item?.enabled),
          // Anything that is not one of the two real kinds is "not chosen",
          // rather than being rounded up to product.
          // Anything that is not one of the three real kinds is "not chosen",
          // rather than being rounded up to product.
          kind: ["product", "category", "deal"].includes(item?.kind) ? item.kind : "",
          // A deal card points at its offer and nothing else; a product or
          // category card points at its target and carries no offer. Whichever
          // one the card is not, is cleared here rather than left to linger
          // and be picked up by the other half of the code later.
          targetId:
            item?.kind === "deal"
              ? ""
              : String(item?.targetId || "").trim().slice(0, 160),
          tag: String(item?.tag || "").trim().slice(0, 40),
          title: String(item?.title || "").trim().slice(0, 80),
          eventPrice:
            item?.eventPrice === "" || item?.eventPrice == null
              ? null
              : Math.max(0, Number(item.eventPrice) || 0),
          /* The offer this card advertises. Only a real id is stored, so a
           * blank picker or a pasted scrap of text clears the link rather
           * than saving something the checkout will later fail to look up. */
          deal:
            item?.kind === "deal" && mongoose.isValidObjectId(item?.deal)
              ? item.deal
              : null,
          image: {
            url: String(item?.image?.url || "").trim().slice(0, 500),
            publicId: String(item?.image?.publicId || "").trim().slice(0, 200),
            alt: String(item?.image?.alt || item?.title || "")
              .trim()
              .slice(0, 160),
          },
        }));
    }
    settings.markModified("events");
    const newThisWeek = req.body.newThisWeek || {};
    if (Object.prototype.hasOwnProperty.call(newThisWeek, "enabled")) {
      settings.newThisWeek.enabled = Boolean(newThisWeek.enabled);
    }
    for (const [key, maxLength] of [
      ["eyebrow", 80],
      ["title", 120],
      ["subtitle", 300],
    ]) {
      if (Object.prototype.hasOwnProperty.call(newThisWeek, key)) {
        settings.newThisWeek[key] = String(newThisWeek[key] || "")
          .trim()
          .slice(0, maxLength);
      }
    }
    if (Object.prototype.hasOwnProperty.call(newThisWeek, "limit")) {
      const limit = Number(newThisWeek.limit);
      if (!Number.isInteger(limit) || limit < 4 || limit > 12) {
        return res.status(400).json({
          message: "New this week product limit must be between 4 and 12",
        });
      }
      settings.newThisWeek.limit = limit;
    }
    settings.bestSellers = settings.bestSellers || {};
    const bestSellers = req.body.bestSellers || {};
    if (Object.prototype.hasOwnProperty.call(bestSellers, "enabled")) {
      settings.bestSellers.enabled = Boolean(bestSellers.enabled);
    }
    if (Object.prototype.hasOwnProperty.call(bestSellers, "limit")) {
      const limit = Number(bestSellers.limit);
      if (!Number.isInteger(limit) || limit < 4 || limit > 12) {
        return res.status(400).json({
          message: "Best seller product limit must be between 4 and 12",
        });
      }
      settings.bestSellers.limit = limit;
    }
    const deals = req.body.deals || {};
    if (Object.prototype.hasOwnProperty.call(deals, "enabled")) {
      settings.deals.enabled = Boolean(deals.enabled);
    }
    for (const [key, maxLength] of [
      ["eyebrow", 80],
      ["title", 120],
      ["subtitle", 300],
      ["ctaLabel", 40],
    ]) {
      if (Object.prototype.hasOwnProperty.call(deals, key)) {
        settings.deals[key] = String(deals[key] || "")
          .trim()
          .slice(0, maxLength);
      }
    }
    if (Object.prototype.hasOwnProperty.call(deals, "limit")) {
      const limit = Number(deals.limit);
      if (!Number.isInteger(limit) || limit < 2 || limit > 8) {
        return res.status(400).json({
          message: "Deals product limit must be between 2 and 8",
        });
      }
      settings.deals.limit = limit;
    }
    /* Checkout copy. Plain text, not markup — it is rendered as text on the
     * storefront, so it needs no sanitising, only bounding. */
    const checkout = req.body.checkout || {};
    if (!settings.checkout) settings.checkout = {};
    for (const [key, maxLength] of [
      ["deliveryNote", 300],
      ["orderTerms", 1200],
    ]) {
      if (Object.prototype.hasOwnProperty.call(checkout, key)) {
        settings.checkout[key] = String(checkout[key] || "")
          .trim()
          .slice(0, maxLength);
      }
    }
    settings.markModified("checkout");

    const blog = req.body.blog || {};
    if (!settings.blog) settings.blog = {};
    for (const [key, maxLength] of [
      ["eyebrow", 80],
      ["heading", 140],
      ["intro", 500],
      ["featuredHeading", 100],
      ["latestHeading", 100],
      ["seoTitle", 70],
      ["seoDescription", 170],
    ]) {
      if (Object.prototype.hasOwnProperty.call(blog, key)) {
        settings.blog[key] = String(blog[key] || "").trim().slice(0, maxLength);
      }
    }
    settings.markModified("blog");
    const business = req.body.business || {};
    for (const key of ["legalName", "tradingName", "companyNumber", "vatNumber"]) {
      if (Object.prototype.hasOwnProperty.call(business, key)) {
        settings.business[key] = String(business[key] || "")
          .trim()
          .slice(0, 200);
      }
    }
    /* Legal pages.
     *
     * These are authored in the same WYSIWYG editor as blog articles now, so
     * they arrive as HTML and have to go through the same allowlist before
     * being stored — the storefront renders them straight onto a public page.
     *
     * Text written under the old plain-text editor is left exactly as it was:
     * it contains no tags, so sanitising is a no-op on it, and the storefront
     * still recognises and renders it with the old "## heading" convention. */
    const policies = req.body.policies || {};
    for (const key of [
      "terms",
      "privacy",
      "shippingReturns",
      "refunds",
      "cookies",
      "about",
    ]) {
      if (Object.prototype.hasOwnProperty.call(policies, key)) {
        const raw = String(policies[key] || "");
        settings.policies[key] = /<[a-z][\s\S]*>/i.test(raw)
          ? sanitizeRichText(raw, POLICY_MAX_LENGTH)
          : raw.trim().slice(0, POLICY_MAX_LENGTH);
      }
    }
    /* ── Customer accounts ─────────────────────────────────────────────────
     * `settings.accounts` and `settings.loyalty` are newer than most of this
     * document, so on a settings row written before they existed they are only
     * hydrated defaults — real-looking objects that Mongoose does not consider
     * part of the document. Writing into one and calling save() silently keeps
     * the old values. Hence both the `if (!settings.x)` guards and the
     * markModified calls below, exactly as every other nested block here does.
     * ------------------------------------------------------------------- */
    const accounts = req.body.accounts || {};
    if (!settings.accounts) settings.accounts = {};
    for (const key of ["enabled", "guestCheckout"]) {
      if (Object.prototype.hasOwnProperty.call(accounts, key)) {
        settings.accounts[key] = Boolean(accounts[key]);
      }
    }
    for (const [key, maxLength] of [
      ["signupHeading", 120],
      ["signupBlurb", 400],
    ]) {
      if (Object.prototype.hasOwnProperty.call(accounts, key)) {
        settings.accounts[key] = String(accounts[key] || "")
          .trim()
          .slice(0, maxLength);
      }
    }
    settings.markModified("accounts");

    /* ── Rewards programme ─────────────────────────────────────────────────
     * The base rules. Every number is clamped to something the programme can
     * survive, because these are the figures that decide what the shop owes
     * its customers and a typo here is expensive in a way a typo in a footer
     * heading is not.
     * ------------------------------------------------------------------- */
    const loyaltySettings = req.body.loyalty || {};
    if (!settings.loyalty) settings.loyalty = {};
    if (Object.prototype.hasOwnProperty.call(loyaltySettings, "enabled")) {
      settings.loyalty.enabled = Boolean(loyaltySettings.enabled);
    }
    if (Object.prototype.hasOwnProperty.call(loyaltySettings, "earnOnShipping")) {
      settings.loyalty.earnOnShipping = Boolean(loyaltySettings.earnOnShipping);
    }
    for (const [key, maxLength] of [
      ["programName", 60],
      ["pointsName", 30],
    ]) {
      if (Object.prototype.hasOwnProperty.call(loyaltySettings, key)) {
        settings.loyalty[key] = String(loyaltySettings[key] || "")
          .trim()
          .slice(0, maxLength);
      }
    }
    if (Object.prototype.hasOwnProperty.call(loyaltySettings, "terms")) {
      settings.loyalty.terms = String(loyaltySettings.terms || "")
        .trim()
        .slice(0, 8000);
    }
    // [field, minimum, maximum]. The redeem rate's floor is 1 and not 0 on
    // purpose: it is a divisor, and zero would make every point worth an
    // unbounded amount of the shop's money.
    for (const [key, min, max] of [
      ["earnRate", 0, 1000],
      ["redeemRate", 1, 100000],
      ["minRedeemPoints", 0, 1000000],
      ["maxRedeemPercent", 0, 100],
      ["signupBonus", 0, 1000000],
      ["reviewBonus", 0, 1000000],
      ["expiryMonths", 0, 120],
    ]) {
      if (Object.prototype.hasOwnProperty.call(loyaltySettings, key)) {
        const value = Number(loyaltySettings[key]);
        settings.loyalty[key] = Number.isFinite(value)
          ? Math.min(max, Math.max(min, value))
          : min;
      }
    }
    if (Array.isArray(loyaltySettings.tiers)) {
      settings.loyalty.tiers = loyaltySettings.tiers
        // A tier with no name cannot be shown to anybody, so it is not a tier.
        .filter((tier) => tier && String(tier.name || "").trim())
        .slice(0, 8)
        .map((tier) => ({
          name: String(tier.name).trim().slice(0, 40),
          threshold: Math.max(0, Number(tier.threshold) || 0),
          multiplier: Math.min(
            10,
            Math.max(0, Number(tier.multiplier) || 1),
          ),
          perk: String(tier.perk || "").trim().slice(0, 160),
        }))
        // Stored in the order they are reached, so the admin's list and the
        // customer's ladder always read the same way round however the shop
        // happened to type them in.
        .sort((a, b) => a.threshold - b.threshold);
    }
    settings.markModified("loyalty");

    settings.updatedBy = req.user?._id;
    await settings.save();
    emit(req, "onlineSettingsChanged", {});
    return res
      .status(200)
      .json({ message: "Storefront settings saved", settings });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({
        message: error.statusCode ? error.message : "Could not save settings",
        error: error.message,
      });
  }
};

module.exports.listHeroSlides = async (req, res) => {
  try {
    const store = await storeId();
    const slides = await OnlineHeroSlide.find({ store })
      .populate({
        path: "listing",
        select: "webName slug brand gallery product",
        populate: { path: "product", select: "name Price quantity image" },
      })
      .populate("listings", "webName slug brand gallery product")
      .populate("category", "name slug")
      .sort({ sortWeight: 1, createdAt: 1 })
      .lean();
    return res.status(200).json({ slides });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load hero slides", error: error.message });
  }
};

const heroFields = async (body, store, current = {}) => {
  const valueOf = (key, fallback) =>
    Object.prototype.hasOwnProperty.call(body, key) ? body[key] : fallback;
  const linkType = valueOf("linkType", current.linkType || "none");
  if (!["none", "product", "products", "category"].includes(linkType)) {
    throw requestError(400, "Choose a valid hero button link type");
  }

  const listing = valueOf("listing", current.listing || "");
  const listings = Array.from(
    new Set(
      (valueOf("listings", current.listings || []) || [])
        .map((id) => String(id?._id || id || ""))
        .filter(Boolean),
    ),
  );
  const category = valueOf("category", current.category || "");

  const payload = {
    eyebrow: String(valueOf("eyebrow", current.eyebrow || "")).trim(),
    titleTop: String(valueOf("titleTop", current.titleTop || "")).trim(),
    titleItalic: String(valueOf("titleItalic", current.titleItalic || "")).trim(),
    titleBadge: String(valueOf("titleBadge", current.titleBadge || "")).trim(),
    titleBottom: String(valueOf("titleBottom", current.titleBottom || "")).trim(),
    copy: String(valueOf("copy", current.copy || "")).trim(),
    ctaPrimary: {
      label:
        String(valueOf("ctaPrimary", current.ctaPrimary || {})?.label || "").trim() ||
        "Shop now",
      to: "",
      params: {},
    },
    ctaSecondary: valueOf("ctaSecondary", current.ctaSecondary || {}),
    linkType,
    listing: null,
    listings: [],
    category: null,
    image: String(valueOf("image", current.image || "")).trim(),
    mobileImage: String(valueOf("mobileImage", current.mobileImage || "")).trim(),
    imageAlt: String(valueOf("imageAlt", current.imageAlt || "")).trim(),
    mobileImageAlt: String(
      valueOf("mobileImageAlt", current.mobileImageAlt || ""),
    ).trim(),
    ctaPosition: ["bottom-left", "bottom-center", "bottom-right"].includes(
      valueOf("ctaPosition", current.ctaPosition || "bottom-left"),
    )
      ? valueOf("ctaPosition", current.ctaPosition || "bottom-left")
      : "bottom-left",
    burst: valueOf("burst", current.burst || {}),
    tone: valueOf("tone", current.tone || "ink"),
    active: Boolean(valueOf("active", current.active ?? true)),
    sortWeight: Number(valueOf("sortWeight", current.sortWeight || 0)) || 0,
  };

  if (!payload.image) throw requestError(400, "Upload or paste a hero banner image");

  if (linkType === "product") {
    if (!listing || !mongoose.isValidObjectId(listing)) {
      throw requestError(400, "Choose the product this banner button should open");
    }
    const found = await OnlineListing.findOne({ _id: listing, store }).lean();
    if (!found) throw requestError(400, "That product is not in this store");
    payload.listing = listing;
  }

  if (linkType === "products") {
    if (!listings.length) {
      throw requestError(400, "Choose at least one product for this banner button");
    }
    if (listings.some((id) => !mongoose.isValidObjectId(id))) {
      throw requestError(400, "One of the selected products is invalid");
    }
    const count = await OnlineListing.countDocuments({ store, _id: { $in: listings } });
    if (count !== listings.length) {
      throw requestError(400, "A selected product is not in this store");
    }
    payload.listings = listings;
  }

  if (linkType === "category") {
    if (!category || !mongoose.isValidObjectId(category)) {
      throw requestError(400, "Choose the category this banner button should open");
    }
    const found = await OnlineCategory.findOne({ _id: category, store }).lean();
    if (!found) throw requestError(400, "That category is not in this store");
    payload.category = category;
  }

  return payload;
};

module.exports.createHeroSlide = async (req, res) => {
  try {
    const store = await storeId();
    const fields = await heroFields(req.body, store);
    const slide = await OnlineHeroSlide.create({ ...fields, store });
    emit(req, "onlineHeroChanged", {});
    return res.status(201).json({ message: "Slide created", slide });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({
        message: error.statusCode ? error.message : "Could not create slide",
        error: error.message,
      });
  }
};

module.exports.updateHeroSlide = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid slide id" });
    const store = await storeId();
    const current = await OnlineHeroSlide.findOne({ _id: req.params.id, store }).lean();
    if (!current) return res.status(404).json({ message: "Slide not found" });
    const updates = await heroFields(req.body, store, current);
    const slide = await OnlineHeroSlide.findOneAndUpdate(
      { _id: req.params.id, store },
      updates,
      { new: true },
    );
    if (!slide) return res.status(404).json({ message: "Slide not found" });
    emit(req, "onlineHeroChanged", {});
    return res.status(200).json({ message: "Slide updated", slide });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({
        message: error.statusCode ? error.message : "Could not update slide",
        error: error.message,
      });
  }
};

module.exports.deleteHeroSlide = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid slide id" });
    const store = await storeId();
    const deleted = await OnlineHeroSlide.findOneAndDelete({
      _id: req.params.id,
      store,
    });
    if (!deleted) return res.status(404).json({ message: "Slide not found" });
    emit(req, "onlineHeroChanged", {});
    return res.status(200).json({ message: "Slide deleted" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not delete slide", error: error.message });
  }
};

/* ───────────────────────────────────────── ADMIN — orders ───────────────── */

module.exports.listOrders = async (req, res) => {
  try {
    const store = await storeId();
    const filter = { store };
    if (req.query.status) filter.status = req.query.status;

    const orders = await OnlineOrder.find(filter)
      .select(
        "orderNo createdAt customer.name customer.email customer.phone customer.account shippingAddress items.product items.name items.price items.quantity items.lineTotal voucher.code subtotal shipping discount total payment.method payment.provider payment.status status timeline tracking loyalty note",
      )
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    return res.status(200).json({
      orders,
      pending: await OnlineOrder.countDocuments({
        store,
        status: { $in: ["pending_payment", "paid", "processing", "ready"] },
      }),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load orders", error: error.message });
  }
};

module.exports.ordersReport = async (req, res) => {
  try {
    const store = await storeId();
    const filter = { store };
    if (req.query.status) filter.status = req.query.status;
    const orders = await OnlineOrder.find(filter)
      .select(
        "orderNo createdAt customer.name customer.email customer.phone items.name items.quantity items.lineTotal voucher.code subtotal shipping total payment.method payment.status status",
      )
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();
    return sendCsv(
      res,
      `online-orders-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Order no",
        "Date",
        "Customer",
        "Email",
        "Phone",
        "Items",
        "Subtotal",
        "Shipping",
        "Total",
        "Voucher",
        "Payment method",
        "Payment status",
        "Order status",
      ],
      orders.map((order) => [
        order.orderNo,
        order.createdAt ? new Date(order.createdAt).toISOString() : "",
        order.customer?.name || "",
        order.customer?.email || "",
        order.customer?.phone || "",
        (order.items || [])
          .map((item) => `${item.name || "Product"} x${item.quantity || 0}`)
          .join("; "),
        money(order.subtotal),
        money(order.shipping),
        money(order.total),
        order.voucher?.code || "",
        order.payment?.method || "",
        order.payment?.status || "",
        order.status || "",
      ]),
    );
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not generate orders report", error: error.message });
  }
};

module.exports.updateOrderStatus = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid order id" });
    const store = await storeId();
    const { status } = req.body;
    const allowed = [
      "paid",
      "processing",
      "ready",
      "shipped",
      "delivered",
      "cancelled",
      "refunded",
    ];
    if (!allowed.includes(status)) {
      return res
        .status(400)
        .json({ message: `Status must be one of: ${allowed.join(", ")}` });
    }

    let order;
    await session.withTransaction(async () => {
      order = await OnlineOrder.findOne({ _id: req.params.id, store }).session(
        session,
      );
      if (!order) {
        throw Object.assign(new Error("Order not found"), { statusCode: 404 });
      }

      // The fulfilment path, and every legal shortcut through it.
      //
      // "ready" (packed, waiting to go out) sits between processing and
      // dispatch, because that is the step the shop actually works through and
      // the one a customer most wants to see. It is not compulsory: a small
      // shop that picks and hands over in one motion can still go straight from
      // processing to delivered, and the customer's tracker shows the skipped
      // step as skipped rather than pretending it happened.
      const transitions = {
        pending_payment: ["paid", "cancelled"],
        paid: ["processing", "ready", "cancelled", "refunded"],
        processing: ["ready", "shipped", "delivered", "cancelled", "refunded"],
        ready: ["shipped", "delivered", "cancelled", "refunded"],
        shipped: ["delivered", "refunded"],
        delivered: ["refunded"],
        cancelled: [],
        refunded: [],
      };
      if (!(transitions[order.status] || []).includes(status)) {
        throw Object.assign(
          new Error(`Order cannot move from ${order.status} to ${status}`),
          { statusCode: 409 },
        );
      }

      const isCashOnDelivery =
        order.payment?.provider === "cod" ||
        order.payment?.method === "cash_on_delivery";
      const paymentCollected =
        status === "paid" || (status === "delivered" && isCashOnDelivery);

      if (paymentCollected && (!order.sales || order.sales.length === 0)) {
        const saleRows = await Sale.create(
          order.items.map((item, index) => ({
            customerName: order.customer.name,
            receiptNo: order.orderNo,
            products: {
              product: item.product,
              quantity: item.quantity,
              price: item.price,
            },
            // Shipping/tax are order-level figures. Attach them to the first
            // ledger line so the Sale rows reconcile exactly to order.total.
            // Shipping, tax and any points spent are order-level figures.
            // They all hang off the FIRST ledger line so the Sale rows still
            // add up to exactly order.total — points included, because a
            // basket part-paid with points brought in less real money and the
            // revenue report has to say so.
            totalAmount: money(
              item.lineTotal +
                (index === 0 ? Number(order.shipping || 0) : 0) +
                (index === 0 ? Number(order.tax || 0) : 0) -
                (index === 0 ? Number(order.loyalty?.redeemedValue || 0) : 0),
            ),
            discount: item.discount,
            tax: index === 0 ? Number(order.tax || 0) : 0,
            paymentStatus: "paid",
            paymentMethod: isCashOnDelivery ? "cash" : "wallet",
            status: "completed",
            source: "online",
          })),
          // `ordered: true` is required by Mongoose to create MULTIPLE docs in a
          // session — without it, any order with 2+ items throws and the whole
          // "mark delivered" fails.
          { session, ordered: true },
        );
        order.sales = saleRows.map((sale) => sale._id);
        order.sale = saleRows[0]?._id || null;
        order.payment.status = "paid";
      }

      if (
        ["cancelled", "refunded"].includes(status) &&
        !order.stockRestoredAt
      ) {
        for (const item of order.items) {
          await Product.updateOne(
            { _id: item.product },
            { $inc: { quantity: item.quantity } },
            { session },
          );
          await StockTransaction.create(
            [
              {
                product: item.product,
                quantity: item.quantity,
                type: "Stock-in",
                reference: `Online ${status} ${order.orderNo}`,
              },
            ],
            { session },
          );
        }
        order.stockRestoredAt = new Date();
      }

      if (
        ["cancelled", "refunded"].includes(status) &&
        order.voucher?.id &&
        !order.voucherReleasedAt
      ) {
        await OnlineVoucher.updateOne(
          { _id: order.voucher.id, store, usedCount: { $gt: 0 } },
          { $inc: { usedCount: -1 } },
          { session },
        );
        order.voucherReleasedAt = new Date();
      }

      if (
        ["cancelled", "refunded"].includes(status) &&
        order.payment.status === "paid" &&
        !order.refundRecordedAt
      ) {
        await Sale.create(
          order.items.map((item, index) => ({
            customerName: order.customer.name,
            receiptNo: `RFD-${order.orderNo}`,
            products: {
              product: item.product,
              quantity: item.quantity,
              price: item.price,
            },
            // Mirrors the sale rows above exactly, points and all, so a
            // refunded order nets to zero in the ledger rather than leaving
            // the points discount behind as phantom revenue.
            totalAmount: -money(
              item.lineTotal +
                (index === 0 ? Number(order.shipping || 0) : 0) +
                (index === 0 ? Number(order.tax || 0) : 0) -
                (index === 0 ? Number(order.loyalty?.redeemedValue || 0) : 0),
            ),
            discount: item.discount,
            tax: index === 0 ? Number(order.tax || 0) : 0,
            paymentStatus: "paid",
            paymentMethod:
              order.payment?.provider === "cod" ||
              order.payment?.method === "cash_on_delivery"
                ? "cash"
                : "wallet",
            status: "cancelled",
            source: "refund",
          })),
          // Same Mongoose rule: multiple refund rows in a session need this.
          { session, ordered: true },
        );
        order.payment.status = "refunded";
        order.refundRecordedAt = new Date();
      }

      /* ── Loyalty ───────────────────────────────────────────────────────
       * Delivery is what makes an earning real: the goods are with the
       * customer and the money (Pick & Pay) is in the till. Cancelling or
       * refunding undoes both directions — the earning comes back off, and
       * anything they PAID with points is handed back, because they paid for
       * something they did not end up receiving.
       *
       * Both guards are stamps on the order, written inside this transaction,
       * so a retried status change cannot pay anybody twice or claw back the
       * same points again.
       * ---------------------------------------------------------------- */
      if (order.customer?.account) {
        const settings = await getOrCreateSettings(store);

        if (status === "delivered" && !order.loyalty?.confirmedAt) {
          await loyalty.confirmPending({ order, settings }, session);
          order.loyalty.confirmedAt = new Date();
        }

        if (
          ["cancelled", "refunded"].includes(status) &&
          !order.loyalty?.reversedAt
        ) {
          await loyalty.reverseOrder({ store, order, settings }, session);
          order.loyalty.reversedAt = new Date();
        }
      }

      // Tracking details, when the shop is dispatching. Accepted on any
      // transition so a courier reference that arrives late can still be added
      // by moving the order along, but only ever added to — an empty field in
      // the form means "nothing new", not "delete what is there".
      const tracking = req.body?.tracking;
      if (tracking && typeof tracking === "object") {
        const keep = (value, max) =>
          String(value ?? "").trim().slice(0, max);
        if (keep(tracking.carrier, 80)) order.tracking.carrier = keep(tracking.carrier, 80);
        if (keep(tracking.number, 120)) order.tracking.number = keep(tracking.number, 120);
        if (keep(tracking.estimate, 120)) order.tracking.estimate = keep(tracking.estimate, 120);
        const url = keep(tracking.url, 500);
        // Only a real http(s) link. This is rendered as an anchor on the
        // customer's own order page, and a "javascript:" tracking URL typed
        // into an admin field would run there.
        if (url) {
          if (!/^https?:\/\//i.test(url)) {
            throw Object.assign(
              new Error("A tracking link must start with http:// or https://"),
              { statusCode: 400 },
            );
          }
          order.tracking.url = url;
        }
      }

      // The step itself, appended to the history. Written for the customer:
      // `note` appears on their order page, so it is the shop talking to them.
      order.timeline.push({
        status,
        at: new Date(),
        by: req.user?._id || null,
        byName: req.user?.name || "",
        note: String(req.body?.note ?? "").trim().slice(0, 300),
      });

      order.status = status;
      await order.save({ session });
    });

    await logActivity({
      action: "Online Order Updated",
      description: `Order ${order.orderNo} marked ${status}.`,
      entity: "onlineOrder",
      entityId: order._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });
    if (["cancelled", "refunded"].includes(status)) {
      const restored = await Product.find(
        { _id: { $in: order.items.map((item) => item.product) } },
        { quantity: 1 },
      ).lean();
      for (const product of restored) {
        emit(req, "stockChanged", {
          productId: String(product._id),
          quantity: Number(product.quantity || 0),
          reason: `online-${status}`,
        });
      }
    }
    emit(req, "onlineOrderChanged", { orderNo: order.orderNo, status });

    // The customer's cached order count and spend only move when an order
    // reaches — or leaves — the set that counts as real trade. Best effort:
    // these are a convenience on the admin's customer list, and a hiccup here
    // must never fail a status change that has already been committed.
    if (order.customer?.account) {
      refreshOrderStats(order.customer.account).catch((error) =>
        console.error("[account] stats refresh failed:", error.message),
      );
    }

    /* Tell the customer their order has moved — dispatched, then delivered,
     * and nothing in between. The delivered one carries the review invitation
     * inside it, so this is the only place either is sent.
     *
     * Best effort throughout: a mail hiccup must never fail a status change
     * that has already been committed. */
    if (["shipped", "delivered"].includes(status)) {
      sendOrderStatusEmail(store, order).catch((error) =>
        console.error("[online] status email failed:", error.message),
      );
    }
    return res.status(200).json({ message: `Order marked ${status}`, order });
  } catch (error) {
    // Log the real cause: a generic "Could not update order" toast otherwise
    // hides why a delivered/paid transition failed.
    if (!error.statusCode) {
      console.error(
        `[orders] status update failed (order ${req.params.id} -> ${req.body?.status}):`,
        error,
      );
    }
    return res
      .status(error.statusCode || 500)
      .json({
        message: error.statusCode ? error.message : "Could not update order",
        error: error.message,
      });
  } finally {
    await session.endSession();
  }
};

/* ───────────────────────────────────────── ADMIN — reporting ────────────── */

// Online takings, and the same figures beside the till's, so the owner can see
// each channel and the combined total in one place.
module.exports.salesSummary = async (req, res) => {
  try {
    const store = await storeId();
    const days = Math.min(Number(req.query.days) || 30, 365);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const paidOnline = {
      store,
      status: { $in: ["paid", "processing", "ready", "shipped", "delivered"] },
      createdAt: { $gte: from },
    };

    const [onlineAgg] = await OnlineOrder.aggregate([
      { $match: paidOnline },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          revenue: { $sum: "$total" },
          units: { $sum: { $sum: "$items.quantity" } },
        },
      },
    ]);

    // The till's side of the ledger, from the same Sale collection online
    // orders write into — so "combined" is a single query, not two systems
    // added up by hand.
    // NOTE: a Sale row is one LINE, not one basket — that is how the till has
    // always written them. Counts here are therefore line counts; the true
    // online order count comes from OnlineOrder above.
    const byChannel = await Sale.aggregate([
      { $match: { createdAt: { $gte: from }, source: { $ne: "refund" } } },
      {
        $group: {
          _id: "$source",
          lines: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
        },
      },
    ]);

    const channel = (name) =>
      byChannel.find((c) => c._id === name) || { lines: 0, revenue: 0 };
    const pos = channel("pos");
    const counter = channel("sales");
    const online = channel("online");

    const topProducts = await OnlineOrder.aggregate([
      { $match: paidOnline },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          name: { $first: "$items.name" },
          units: { $sum: "$items.quantity" },
          revenue: { $sum: "$items.lineTotal" },
        },
      },
      { $sort: { units: -1 } },
      { $limit: 10 },
    ]);

    const statusCounts = await OnlineOrder.aggregate([
      { $match: { store } },
      { $group: { _id: "$status", n: { $sum: 1 } } },
    ]);

    return res.status(200).json({
      rangeDays: days,
      online: {
        orders: onlineAgg?.orders || 0,
        revenue: money(onlineAgg?.revenue || 0),
        units: onlineAgg?.units || 0,
      },
      channels: {
        online: {
          lines: online.lines,
          revenue: money(online.revenue),
          orders: onlineAgg?.orders || 0,
        },
        pos: { lines: pos.lines, revenue: money(pos.revenue) },
        counter: { lines: counter.lines, revenue: money(counter.revenue) },
        combined: {
          lines: online.lines + pos.lines + counter.lines,
          revenue: money(online.revenue + pos.revenue + counter.revenue),
        },
      },
      topProducts,
      statusCounts: Object.fromEntries(statusCounts.map((s) => [s._id, s.n])),
      catalogue: {
        listed: await OnlineListing.countDocuments({ store, listed: true }),
        total: await OnlineListing.countDocuments({ store }),
        categories: await OnlineCategory.countDocuments({ store }),
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not build the report", error: error.message });
  }
};

/* ───────────────────────────────────────── STOREFRONT — reads ───────────── */

const publicStorefrontCategories = (cats) => {
  // Resolve each parent to its slug so the storefront (which is slug-centric)
  // can build the tree without a second lookup. A parent that is itself hidden
  // is treated as top-level so its children don't vanish from the nav.
  const slugById = new Map(cats.map((c) => [String(c._id), c.slug]));
  return cats.map((c) => ({
    id: String(c._id),
    slug: c.slug,
    name: c.name,
    description: c.description,
    image: c.image,
    sortWeight: c.sortWeight,
    parent: (c.parent && slugById.get(String(c.parent))) || null,
  }));
};

const loadStorefrontCategories = async (store) => {
  const cats = await OnlineCategory.find({ store, active: true })
    .sort({ sortWeight: 1, name: 1 })
    .lean();
  return publicStorefrontCategories(cats);
};

module.exports.storefrontCategories = async (req, res) => {
  try {
    const store = await storeId();
    return res.status(200).json({
      categories: await cachedStorefrontRead("categories", () =>
        loadStorefrontCategories(store),
      ),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load categories", error: error.message });
  }
};

/* The events section as the website needs to read it.
 *
 * A card stores its offer as an id. The page has to be able to PRINT the
 * offer — "Any 5 for 15" — so the terms are resolved here, once, rather than
 * the storefront being given an id and no way to look it up.
 *
 * Read fresh from the deal itself rather than copied into the settings when
 * the card was saved: an offer edited at the till would otherwise go on being
 * advertised on its old terms, which is the sort of difference a customer
 * finds before the shop does.
 *
 * A deal that has been switched off is dropped here, so the card stops
 * advertising an offer the checkout would refuse to give. */
const eventsForStorefront = async (settings) => {
  const events = settings.events?.toObject?.() || settings.events || {};
  const items = Array.isArray(events.items) ? events.items : [];
  const ids = items.map((item) => item?.deal).filter(Boolean);
  if (!ids.length) return events;

  const deals = await Deal.find({
    _id: { $in: ids },
    active: true,
    $or: [{ channel: "online" }, { channel: "both" }, { channel: { $exists: false } }],
  })
    .select("name mode groupQuantity discountType discount startsAt endsAt items.product")
    .lean();
  const byId = new Map(deals.map((deal) => [String(deal._id), deal]));

  return {
    ...events,
    items: items.map((item) => {
      const plain = item?.toObject?.() || item;
      const deal = plain?.deal ? byId.get(String(plain.deal)) : null;
      return {
        ...plain,
        deal: deal
          ? {
              id: String(deal._id),
              name: deal.name,
              mode: deal.mode,
              groupQuantity: deal.groupQuantity,
              discountType: deal.discountType,
              discount: deal.discount,
              /* The products the offer covers.
               *
               * A deal card has no single product of its own, so it needs
               * somewhere to send a shopper who clicks it. The website
               * already knows which listing each product belongs to, so
               * handing it the ids lets it pick a real destination instead of
               * the card being a dead end. */
              productIds: (deal.items || [])
                .map((entry) => String(entry.product || ""))
                .filter(Boolean),
            }
          : null,
      };
    }),
  };
};

const publicStorefrontSettings = (settings, events) => ({
  logo: settings.logo,
  social: settings.social,
  footer: settings.footer,
  footerLinks: settings.footerLinks,
  announcement: settings.announcement,
  events: events || settings.events,
  emergencyAlert: settings.emergencyAlert,
  shipping: settings.shipping,
  promises: settings.promises,
  newThisWeek: settings.newThisWeek,
  bestSellers: settings.bestSellers,
  deals: settings.deals,
  blog: settings.blog,
  // What the checkout tells a shopper about delivery, and the terms shown once
  // an order is placed. Copy only — the money is worked out server-side.
  checkout: {
    deliveryNote: settings.checkout?.deliveryNote || "",
    orderTerms: settings.checkout?.orderTerms || "",
  },
  business: settings.business,
  policies: settings.policies,
  // Whether the storefront shows sign-in links at all, and whether it may
  // check somebody out as a guest.
  accounts: {
    enabled: settings.accounts?.enabled !== false,
    guestCheckout: settings.accounts?.guestCheckout !== false,
    signupHeading: settings.accounts?.signupHeading || "Create your account",
    signupBlurb: settings.accounts?.signupBlurb || "",
  },
  // The programme as a SHOPPER may see it: what it is called, what a point is
  // worth, what the ladder looks like. Deliberately not the whole settings
  // block — the shop's internal ceilings (per-order caps, expiry policy) are
  // its own business and belong nowhere near a page a customer can read.
  loyalty: {
    enabled: Boolean(settings.loyalty?.enabled),
    programName: settings.loyalty?.programName || "Rewards",
    pointsName: settings.loyalty?.pointsName || "points",
    earnRate: Number(settings.loyalty?.earnRate ?? 1),
    redeemRate: Number(settings.loyalty?.redeemRate ?? 100),
    minRedeemPoints: Number(settings.loyalty?.minRedeemPoints ?? 0),
    maxRedeemPercent: Number(settings.loyalty?.maxRedeemPercent ?? 50),
    signupBonus: Number(settings.loyalty?.signupBonus ?? 0),
    tiers: (settings.loyalty?.tiers || []).map((tier) => ({
      name: tier.name,
      threshold: tier.threshold,
      multiplier: tier.multiplier,
      perk: tier.perk || "",
    })),
    terms: settings.loyalty?.terms || "",
  },
});

const BLOG_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "quote",
  "image",
  "video",
  "button",
]);
const blogMediaUrl = (raw) => {
  const value = String(raw || "").trim().slice(0, 2000);
  if (!value) return "";
  if (/^(https?:\/\/|\/(?!\/))/i.test(value)) return value;
  throw requestError(400, "Blog media must use a valid http(s) or site-relative URL");
};
const cleanBlogBlocks = (blocks) =>
  (Array.isArray(blocks) ? blocks : []).slice(0, 40).map((block) => ({
    type: BLOG_BLOCK_TYPES.has(block?.type) ? block.type : "paragraph",
    text: String(block?.text || "").trim().slice(0, 12000),
    url: blogMediaUrl(block?.url),
    caption: String(block?.caption || "").trim().slice(0, 300),
    alt: String(block?.alt || "").trim().slice(0, 300),
    level: block?.level === "h3" ? "h3" : "h2",
    align: ["left", "center", "right"].includes(block?.align)
      ? block.align
      : "left",
  }));
const uniqueBlogSlug = async (store, candidate, excludeId = null) => {
  const base = slugify(candidate) || `article-${Date.now()}`;
  let slug = base;
  let suffix = 2;
  while (
    await OnlineBlogPost.exists({
      store,
      slug,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
  ) {
    slug = `${base}-${suffix++}`;
  }
  return slug;
};
const applyBlogPayload = async (post, payload, store) => {
  if (Object.prototype.hasOwnProperty.call(payload, "title")) {
    post.title = String(payload.title || "").trim().slice(0, 180);
  }
  if (!post.title) throw requestError(400, "Blog title is required");
  if (Object.prototype.hasOwnProperty.call(payload, "slug") || post.isNew) {
    post.slug = await uniqueBlogSlug(store, payload.slug || post.title, post.isNew ? null : post._id);
  }
  for (const [key, max] of [
    ["excerpt", 600],
    ["author", 100],
    ["seoTitle", 70],
    ["seoDescription", 170],
    ["coverAlt", 300],
  ]) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      post[key] = String(payload[key] || "").trim().slice(0, max);
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, "coverImage")) {
    post.coverImage = blogMediaUrl(payload.coverImage);
  }
  /* The article body.
   *
   * This is the only assignment to post.content in the codebase and it is
   * always sanitised — see libs/richText. Saving a post that carries `content`
   * also drops any legacy `blocks`, so a migrated article does not keep a
   * stale second copy of itself that the storefront might fall back to. */
  if (Object.prototype.hasOwnProperty.call(payload, "content")) {
    post.content = sanitizeRichText(payload.content);
    post.readingMinutes = readingMinutes(post.content);
    if (post.content) post.blocks = [];
  }
  // Still accepted so an older client, or a payload replayed from a backup,
  // does not lose its body. Nothing in the app sends this any more.
  if (Object.prototype.hasOwnProperty.call(payload, "blocks")) {
    post.blocks = cleanBlogBlocks(payload.blocks);
  }
  // An article with no excerpt gets a mechanical one rather than shipping a
  // blank meta description and an empty card on the blog index.
  if (!post.excerpt && post.content) {
    post.excerpt = excerptFrom(post.content, 220).slice(0, 600);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "canonicalUrl")) {
    const canonical = String(payload.canonicalUrl || "").trim().slice(0, 2000);
    if (canonical && !/^https?:\/\//i.test(canonical)) {
      throw requestError(400, "Canonical URL must be a full http(s) address");
    }
    post.canonicalUrl = canonical;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "noindex")) {
    post.noindex = Boolean(payload.noindex);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "featured")) {
    post.featured = Boolean(payload.featured);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "titleAlign")) {
    post.titleAlign = payload.titleAlign === "left" ? "left" : "center";
  }
  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    post.status = payload.status === "published" ? "published" : "draft";
  }
  if (post.status === "published") {
    post.publishedAt = payload.publishedAt ? new Date(payload.publishedAt) : post.publishedAt || new Date();
    if (Number.isNaN(post.publishedAt?.getTime())) throw requestError(400, "Invalid publish date");
  } else {
    post.publishedAt = null;
  }
};

module.exports.listBlogPosts = async (req, res) => {
  try {
    const store = await storeId();
    const posts = await OnlineBlogPost.find({ store }).sort({ updatedAt: -1 }).lean();
    return res.status(200).json({ posts });
  } catch (error) {
    return res.status(500).json({ message: "Could not load blog posts", error: error.message });
  }
};

module.exports.createBlogPost = async (req, res) => {
  try {
    const store = await storeId();
    const post = new OnlineBlogPost({ store, updatedBy: req.user?._id });
    await applyBlogPayload(post, req.body || {}, store);
    await post.save();
    emit(req, "onlineBlogChanged", {});
    return res.status(201).json({ message: "Blog post created", post });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Could not create blog post",
      error: error.message,
    });
  }
};

module.exports.updateBlogPost = async (req, res) => {
  try {
    const store = await storeId();
    const post = await OnlineBlogPost.findOne({ _id: req.params.id, store });
    if (!post) return res.status(404).json({ message: "Blog post not found" });
    await applyBlogPayload(post, req.body || {}, store);
    post.updatedBy = req.user?._id;
    await post.save();
    emit(req, "onlineBlogChanged", {});
    return res.status(200).json({ message: "Blog post saved", post });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Could not update blog post",
      error: error.message,
    });
  }
};

module.exports.deleteBlogPost = async (req, res) => {
  try {
    const store = await storeId();
    const post = await OnlineBlogPost.findOneAndDelete({ _id: req.params.id, store });
    if (!post) return res.status(404).json({ message: "Blog post not found" });
    emit(req, "onlineBlogChanged", {});
    return res.status(200).json({ message: "Blog post deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Could not delete blog post", error: error.message });
  }
};

module.exports.storefrontBlogPosts = async (req, res) => {
  try {
    const store = await storeId();
    const posts = await OnlineBlogPost.find({
      store,
      status: "published",
      publishedAt: { $lte: new Date() },
    })
      /* Deliberately NOT `content`.
       *
       * The index page shows a card per article — cover, title, excerpt — so
       * shipping every article body here meant the listing payload grew with
       * every post published and the cards printed whole articles. `blocks`
       * comes along only so a post written before the WYSIWYG editor, and not
       * yet migrated, can still show a cover image pulled out of its blocks. */
      .select(
        "title slug excerpt coverImage coverAlt author publishedAt seoTitle seoDescription featured titleAlign readingMinutes blocks noindex canonicalUrl",
      )
      .sort({ featured: -1, publishedAt: -1 })
      .lean();
    return res.status(200).json({ posts });
  } catch (error) {
    return res.status(500).json({ message: "Could not load blog", error: error.message });
  }
};

module.exports.storefrontBlogPost = async (req, res) => {
  try {
    const store = await storeId();
    const slug = slugify(req.params.slug);
    const post = await OnlineBlogPost.findOne({
      store,
      slug,
      status: "published",
      publishedAt: { $lte: new Date() },
    })
      .select(
        "title slug excerpt coverImage coverAlt author publishedAt updatedAt seoTitle seoDescription content blocks featured titleAlign readingMinutes canonicalUrl noindex",
      )
      .lean();
    if (!post) return res.status(404).json({ message: "Blog post not found" });
    return res.status(200).json({ post });
  } catch (error) {
    return res.status(500).json({ message: "Could not load blog post", error: error.message });
  }
};

module.exports.storefrontSettings = async (req, res) => {
  try {
    const store = await storeId();
    const settings = await cachedStorefrontRead("settings", async () =>
      (async () => {
        const current = await getOrCreateSettings(store);
        return publicStorefrontSettings(current, await eventsForStorefront(current));
      })(),
    );
    return res.status(200).json({
      settings,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load store settings", error: error.message });
  }
};

module.exports.subscribeNewsletter = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }
    const store = await storeId();
    const subscriber = await OnlineNewsletterSubscriber.findOneAndUpdate(
      { store, email },
      { $set: { active: true, source: "footer" }, $setOnInsert: { store, email } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    return res.status(201).json({
      message: "Thanks — you're subscribed.",
      subscriber: { email: subscriber.email, createdAt: subscriber.createdAt },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({ message: "This email is already subscribed." });
    }
    return res
      .status(500)
      .json({ message: "Could not save newsletter email", error: error.message });
  }
};

module.exports.listNewsletterSubscribers = async (_req, res) => {
  try {
    const store = await storeId();
    const subscribers = await OnlineNewsletterSubscriber.find({ store })
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();
    return res.status(200).json({ subscribers });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load newsletter emails", error: error.message });
  }
};

module.exports.newsletterReport = async (_req, res) => {
  try {
    const store = await storeId();
    const subscribers = await OnlineNewsletterSubscriber.find({ store })
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();
    return sendCsv(
      res,
      `newsletter-emails-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Email", "Source", "Status", "Subscribed at"],
      subscribers.map((subscriber) => [
        subscriber.email,
        subscriber.source || "footer",
        subscriber.active ? "active" : "inactive",
        subscriber.createdAt ? new Date(subscriber.createdAt).toISOString() : "",
      ]),
    );
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not generate newsletter report", error: error.message });
  }
};

// Public contact form. Emails the shop's own support inbox (falling back to the
// notifications address) using the shared mailer, branded as the shop. Best
// effort by design — a mail hiccup or an unconfigured mailbox must not surface
// as an error to the visitor, and a bot that trips the honeypot is dropped
// silently so it gets no signal either way.
module.exports.submitContactMessage = async (req, res) => {
  try {
    const { name, email, subject, message, website } = req.body || {};

    // Honeypot: a hidden field no human ever fills. If it's set, it's a bot —
    // acknowledge and discard.
    if (website) {
      return res.status(200).json({ message: "Thanks — your message has been sent." });
    }

    const cleanName = String(name || "").trim().slice(0, 120);
    const cleanEmail = String(email || "").trim().toLowerCase().slice(0, 200);
    const cleanSubject = String(subject || "").trim().slice(0, 150) || "Website enquiry";
    const cleanMessage = String(message || "").trim().slice(0, 4000);

    if (cleanName.length < 2 || cleanMessage.length < 5) {
      return res
        .status(400)
        .json({ message: "Please add your name and a short message." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }

    const store = await storeId();
    const [shop, settings] = await Promise.all([
      Store.findById(store).lean(),
      getOrCreateSettings(store),
    ]);
    const to =
      settings?.footer?.supportEmail || shop?.notificationsEmail || "";

    const bodyHtml = `
      <p style="margin:0 0 12px;">You received a new message from the website contact form.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:4px 0;color:#6b7280;width:90px;">Name</td><td style="padding:4px 0;">${esc(cleanName)}</td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;">Email</td><td style="padding:4px 0;"><a href="mailto:${esc(cleanEmail)}">${esc(cleanEmail)}</a></td></tr>
        <tr><td style="padding:4px 0;color:#6b7280;">Subject</td><td style="padding:4px 0;">${esc(cleanSubject)}</td></tr>
      </table>
      <div style="margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb;white-space:pre-wrap;">${esc(cleanMessage)}</div>
    `;

    await sendMail({
      to,
      subject: `Website enquiry — ${cleanSubject}`,
      html: brandedHtml(shop, bodyHtml),
      fromName: shop?.name || "Online store",
    });

    return res.status(200).json({ message: "Thanks — your message has been sent." });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not send your message. Please try again shortly." });
  }
};

const loadStorefrontProducts = async (
  store,
  { category = "", compact = true } = {},
) => {
  const filter = { store, listed: true };
  if (category) {
    const cat = await OnlineCategory.findOne({
      store,
      slug: String(category),
    })
      .select("_id")
      .lean();
    if (cat) {
      // A parent category page gathers its own products plus everything filed
      // under its sub-categories, so browsing the top level shows the full range.
      const descendants = await collectDescendantIds(store, cat._id);
      const ids = [cat._id, ...descendants];
      filter.$or = [{ category: { $in: ids } }, { categories: { $in: ids } }];
    }
  }
  const listings = await OnlineListing.find(filter)
    .populate("product", "name Price quantity image")
    .populate("variants.product", "name Price quantity image")
    .populate({
      path: "linkedListings.listing",
      populate: [
        { path: "product", select: "name Price quantity image" },
        { path: "variants.product", select: "name Price quantity image" },
        { path: "category", select: "name slug" },
        { path: "categories", select: "name slug" },
      ],
    })
    .populate("category", "name slug")
    .populate("categories", "name slug")
    .sort({ sortWeight: 1, createdAt: -1 })
    .lean();
  const linkedChildIds = new Set();
  for (const listing of listings) {
    for (const link of listing.linkedListings || []) {
      const childId = link?.listing?._id || link?.listing;
      if (childId) linkedChildIds.add(String(childId));
    }
  }
  const visibleListings = listings.filter(
    (listing) => !linkedChildIds.has(String(listing._id)),
  );

  const ratings = await ratingByListing(
    store,
    visibleListings.map((l) => l._id),
  );
  for (const l of visibleListings) l.rating = ratings.get(String(l._id));
  return visibleListings
    .map((listing) => publicListing(listing, { compact }))
    .filter(Boolean);
};

module.exports.storefrontCatalog = async (req, res) => {
  try {
    const store = await storeId();
    return res.status(200).json(
      await cachedStorefrontRead("catalog:card", async () => {
        const [categories, products, settings] = await Promise.all([
          loadStorefrontCategories(store),
          loadStorefrontProducts(store, { compact: true }),
          getOrCreateSettings(store),
        ]);
        return {
          categories,
          products,
          settings: publicStorefrontSettings(settings, await eventsForStorefront(settings)),
        };
      }),
    );
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load storefront catalog", error: error.message });
  }
};

module.exports.storefrontProducts = async (req, res) => {
  try {
    const compact = req.query.view === "card";
    const store = await storeId();
    const category = String(req.query.category || "");
    return res.status(200).json({
      products: await cachedStorefrontRead(
        `products:${compact ? "card" : "full"}:${category}`,
        () => loadStorefrontProducts(store, { category, compact }),
      ),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load products", error: error.message });
  }
};

module.exports.storefrontProduct = async (req, res) => {
  try {
    const store = await storeId();
    const listing = await OnlineListing.findOne({
      store,
      listed: true,
      slug: String(req.params.slug).toLowerCase(),
    })
      .populate("product", "name Price quantity image")
      .populate("variants.product", "name Price quantity image")
      .populate({
        path: "linkedListings.listing",
        populate: [
          { path: "product", select: "name Price quantity image" },
          { path: "variants.product", select: "name Price quantity image" },
          { path: "category", select: "name slug" },
          { path: "categories", select: "name slug" },
        ],
      })
      .populate("category", "name slug")
      .populate("categories", "name slug")
      .lean();
    if (!listing) return res.status(404).json({ message: "Product not found" });
    const ratings = await ratingByListing(store, [listing._id]);
    listing.rating = ratings.get(String(listing._id));
    return res.status(200).json({ product: publicListing(listing) });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load product", error: error.message });
  }
};

module.exports.storefrontHero = async (req, res) => {
  try {
    const store = await storeId();
    const slides = await OnlineHeroSlide.find({ store, active: true })
      .populate({
        path: "listing",
        populate: { path: "product", select: "name Price quantity image" },
      })
      .populate("listings", "webName slug")
      .populate("category", "name slug")
      .sort({ sortWeight: 1, createdAt: 1 })
      .lean();

    return res.status(200).json({
      slides: slides.map((s) => {
        const productSlug = String(s.listing?.slug || "");
        const productSlugs = (s.listings || []).map((item) => item.slug).filter(Boolean);
        const categorySlug = String(s.category?.slug || "");
        const linkType = s.linkType || (productSlug ? "product" : "none");
        const linked =
          (linkType === "product" && productSlug) ||
          (linkType === "products" && productSlugs.length) ||
          (linkType === "category" && categorySlug);
        const ctaPrimary =
          linkType === "product" && productSlug
            ? {
                label: String(s.ctaPrimary?.label || "").trim() || "Shop now",
                to: "/product/$id",
                params: { id: productSlug },
              }
            : linkType === "products" && productSlugs.length
              ? {
                  label: String(s.ctaPrimary?.label || "").trim() || "Shop now",
                  to: "/shop",
                  params: {},
                  search: { products: productSlugs.join(",") },
                }
              : linkType === "category" && categorySlug
                ? {
                    label: String(s.ctaPrimary?.label || "").trim() || "Shop now",
                    to: "/category/$slug",
                    params: { slug: categorySlug },
                  }
                : null;
        return {
          id: String(s._id),
          eyebrow: s.eyebrow,
          titleTop: s.titleTop,
          titleItalic: s.titleItalic,
          titleBadge: s.titleBadge,
          titleBottom: s.titleBottom,
          copy: s.copy,
          linkType,
          linked: Boolean(linked),
          ctaPrimary,
          ctaSecondary: {
            label: String(s.ctaSecondary?.label || "").trim() || "Browse all",
            to: "/shop",
            params: {},
          },
          image: s.image,
          mobileImage: s.mobileImage,
          imageAlt: s.imageAlt,
          ctaPosition: s.ctaPosition || "bottom-left",
          burst: s.burst,
          tone: s.tone,
          product: s.listing?.product
            ? {
                slug: productSlug,
                name: s.listing.webName || s.listing.product.name,
                brand: s.listing.brand,
                price: money(displayPrice(s.listing, s.listing.product)),
                was: baseSaleActive(s.listing)
                  ? money(
                      Math.max(
                        Number(s.listing.compareAtPrice || 0),
                        regularItemPrice(s.listing, s.listing.product),
                      ),
                    )
                  : s.listing.compareAtPrice || null,
                stock: Number(s.listing.product.quantity || 0),
              }
            : null,
        };
      }),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load hero slides", error: error.message });
  }
};

/* ───────────────────────────────────────── STOREFRONT — place order ─────── */

/**
 * The whole point of the integration.
 *
 * Stock comes off through the SAME guarded decrement the till uses:
 *   findOneAndUpdate({ _id, quantity: { $gte: n } }, { $inc: { quantity: -n } })
 * The filter re-checks stock at write time, so the website and a cashier
 * cannot both sell the last unit. If any line is short, everything already
 * taken is put back and the order is refused — a half-sold basket is never
 * left behind.
 *
 * Idempotent on `clientRef`: replaying the request (a retry, a webhook firing
 * twice) returns the original order instead of charging the shelf twice.
 */
/**
 * What this basket is worth in points, before it is bought.
 *
 * Called by the checkout page as the basket changes, so a shopper is told what
 * they will earn and how much of it they may spend BEFORE they commit — rather
 * than discovering it on a confirmation screen when it is too late to add the
 * one more item that would have tipped them over a bonus.
 *
 * Reads only. Every figure is recomputed for real when the order is actually
 * placed, so nothing a browser does with this response can change what it pays.
 */
module.exports.storefrontLoyaltyQuote = async (req, res) => {
  try {
    const store = await storeId();
    const settings = await getOrCreateSettings(store);
    const config = loyalty.programme(settings);

    /* Whether the shop runs a points programme has nothing to do with
     * whether it runs offers, so the early exit below answers the offers
     * first. A basket page that showed a total the checkout then undercut
     * would be wrong even though the shopper pays less — they decided to buy
     * at the price they were shown. */
    const hasOffers = eventDealIds(settings).length > 0;
    if (!config.enabled && !hasOffers) {
      return res.status(200).json({ enabled: false });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
    if (!items.length) {
      return res.status(200).json({
        enabled: config.enabled,
        earn: 0,
        redeem: null,
        deals: [],
        dealDiscount: 0,
      });
    }

    const lines = await resolveOrderLines(store, items);
    const subtotal = money(lines.reduce((sum, line) => sum + line.subtotal, 0));

    // The voucher, if one is applied, changes what the lines are worth and so
    // changes what they earn. Failing to price it is not a reason to refuse the
    // quote — the shopper simply sees the earning on the undiscounted basket,
    // and the real figure is worked out at checkout either way.
    let discount = 0;
    if (String(req.body?.voucherCode || "").trim()) {
      try {
        const voucher = await OnlineVoucher.findOne({
          store,
          code: String(req.body.voucherCode).trim().toUpperCase(),
        });
        if (voucher) {
          const result = await evaluateVoucher(
            voucher,
            lines,
            req.customer?.email || "",
          );
          allocateDiscount(lines, result.eligibleLines, result.discount);
          discount = money(result.discount);
        }
      } catch {
        /* an invalid voucher is the checkout's problem, not the quote's */
      }
    }

    /* The same set offers checkout will price, priced here too.
     *
     * This quote is what the basket page shows before anyone pays, and it is
     * also what caps the points slider and decides free delivery. If it left
     * the offers out, the shopper would be shown one merchandise total and
     * charged against another — and the difference would surface at the worst
     * possible moment, on the payment screen. */
    const dealQuote = await dealsForBasket(
      settings,
      lines,
      Math.max(subtotal - discount, 0),
    );
    const dealDiscount = money(dealQuote.discount);

    const offers = (dealQuote.applied || []).map((entry) => ({
      name: entry.name,
      sets: entry.sets,
      amount: entry.amount,
    }));
    if (!config.enabled) {
      return res.status(200).json({
        enabled: false,
        deals: offers,
        dealDiscount,
      });
    }

    const merchandiseTotal = money(subtotal - discount - dealDiscount);
    const shipping = shippingFor(settings, merchandiseTotal);

    const account = req.customer || null;
    const tier = loyalty.tierFor(settings, account?.points?.lifetime || 0);
    const earning = loyalty.quoteEarning({
      settings,
      rules: await loyalty.activeRules(store),
      lines,
      shipping,
      tierMultiplier: account ? tier.multiplier : 1,
    });

    // The most this basket could absorb, so the page can cap its own slider
    // instead of guessing and being corrected by the server.
    const balance = Math.max(0, Number(account?.points?.balance || 0));
    const ceiling = Math.min(
      balance,
      Math.floor(
        ((merchandiseTotal * config.maxRedeemPercent) / 100) * config.redeemRate,
      ),
    );
    const requested = Math.max(0, Math.trunc(Number(req.body?.redeemPoints) || 0));
    const chosen = requested
      ? loyalty.quoteRedemption({
          settings,
          balance,
          merchandiseTotal,
          requestedPoints: requested,
        })
      : { points: 0, value: 0, reason: "" };

    return res.status(200).json({
      enabled: true,
      pointsName: config.pointsName,
      programName: config.programName,
      // Signed out, this is still the honest answer: it is what they WOULD earn,
      // which is the whole argument for creating an account at this moment.
      earn: earning.points,
      /* The set offers this basket has already earned, so the page can show
       * them beside the total instead of the shopper meeting the discount for
       * the first time on the payment screen. */
      deals: offers,
      dealDiscount,
      breakdown: earning.breakdown,
      signedIn: Boolean(account),
      tier: account ? tier.current : null,
      redeem: {
        balance,
        max: Math.max(0, ceiling),
        minPoints: config.minRedeemPoints,
        rate: config.redeemRate,
        maxPercent: config.maxRedeemPercent,
        points: chosen.points,
        value: chosen.value,
        reason: chosen.reason,
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Could not price those points",
    });
  }
};

module.exports.validateStorefrontVoucher = async (req, res) => {
  try {
    const store = await storeId();
    const code = String(req.body.code || "")
      .trim()
      .toUpperCase();
    if (!code) return res.status(400).json({ message: "Enter a voucher code" });
    if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
      return res
        .status(400)
        .json({ message: "Add products before applying a voucher" });
    }
    const [voucher, lines] = await Promise.all([
      OnlineVoucher.findOne({ store, code }),
      resolveOrderLines(store, req.body.items),
    ]);
    if (!voucher)
      return res.status(404).json({ message: "Voucher code not found" });
    const result = await evaluateVoucher(voucher, lines, req.body.email);
    return res.status(200).json({
      valid: true,
      voucher: {
        code: voucher.code,
        name: voucher.name,
        discountType: voucher.discountType,
        value: voucher.value,
      },
      eligibleSubtotal: result.eligibleSubtotal,
      discount: result.discount,
      message: `${voucher.code} applied — you save €${result.discount.toFixed(2)}`,
    });
  } catch (error) {
    return res
      .status(error.statusCode || 500)
      .json({
        valid: false,
        message: error.statusCode
          ? error.message
          : "Could not validate voucher",
      });
  }
};

module.exports.placeOrderLegacy = async (req, res) => {
  try {
    const store = await storeId();
    const { items, customer, shippingAddress = {}, clientRef } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "The order has no items" });
    }
    if (!customer?.name?.trim() || !customer?.email?.trim()) {
      return res
        .status(400)
        .json({ message: "Customer name and email are required" });
    }

    if (clientRef) {
      const existing = await OnlineOrder.findOne({ clientRef }).lean();
      if (existing)
        return res
          .status(200)
          .json({
            message: "Order already placed",
            order: existing,
            idempotent: true,
          });
    }

    // ── Pass 1: validate everything before touching stock.
    const lines = [];
    for (const item of items) {
      if (
        !mongoose.isValidObjectId(item.listing) &&
        !mongoose.isValidObjectId(item.product)
      ) {
        return res.status(400).json({ message: "Invalid item reference" });
      }
      const listing = mongoose.isValidObjectId(item.listing)
        ? await OnlineListing.findOne({
            _id: item.listing,
            store,
            listed: true,
          })
            .populate("product")
            .populate("variants.product")
        : await OnlineListing.findOne({
            product: item.product,
            store,
            listed: true,
          })
            .populate("product")
            .populate("variants.product");

      if (!listing || !listing.product) {
        return res
          .status(404)
          .json({ message: "A product on this order is no longer available" });
      }
      const qty = Number(item.quantity || 0);
      if (!Number.isInteger(qty) || qty <= 0) {
        return res
          .status(400)
          .json({
            message: `Invalid quantity for ${listing.webName || listing.product.name}`,
          });
      }

      const variants = listing.variants || [];
      const selectedVariant = variants.length
        ? variants.find(
            (variant) =>
              variant.product &&
              String(variant.product._id) === String(item.product || ""),
          )
        : null;
      if (variants.length && !selectedVariant) {
        return res.status(400).json({
          message: `Choose a valid option for ${listing.webName || listing.product.name}`,
        });
      }

      const selectedProduct = selectedVariant?.product || listing.product;
      if (
        !variants.length &&
        item.product &&
        String(item.product) !== String(listing.product._id)
      ) {
        return res.status(400).json({
          message: `Invalid inventory item for ${listing.webName || listing.product.name}`,
        });
      }

      const lineName = selectedVariant?.label
        ? `${listing.webName || listing.product.name} — ${selectedVariant.label}`
        : listing.webName || listing.product.name;
      if (Number(selectedProduct.quantity) < qty) {
        return res.status(409).json({
          message: `Only ${selectedProduct.quantity} left of ${lineName}`,
          product: lineName,
          available: selectedProduct.quantity,
        });
      }
      const price = money(
        selectedVariant?.priceOverride != null
          ? selectedVariant.priceOverride
          : listingPrice(listing, selectedProduct),
      );
      if (!Number.isFinite(price) || price <= 0) {
        return res.status(409).json({
          message: `${lineName} is visible but its price still needs to be confirmed`,
          product: lineName,
        });
      }
      lines.push({
        listing,
        product: selectedProduct,
        name: lineName,
        brand: listing.brand,
        price,
        quantity: qty,
        lineTotal: money(price * qty),
      });
    }

    const subtotal = money(lines.reduce((s, l) => s + l.lineTotal, 0));
    // Checkout totals are server-owned. A browser cannot grant itself a
    // discount or replace the shipping amount in the request body.
    const disc = 0;
    const tax = 0;
    const ship = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT;
    const total = money(subtotal + ship);

    // ── Pass 2: take the stock, undoing everything if any line is short.
    const taken = [];
    try {
      for (const l of lines) {
        const updated = await Product.findOneAndUpdate(
          { _id: l.product._id, quantity: { $gte: l.quantity } },
          { $inc: { quantity: -l.quantity } },
          { new: true },
        );
        if (!updated) {
          throw Object.assign(
            new Error(`${l.name} sold out while the order was being placed`),
            { statusCode: 409 },
          );
        }
        taken.push({
          product: updated._id,
          quantity: l.quantity,
          newQuantity: updated.quantity,
        });
      }
    } catch (err) {
      await Promise.all(
        taken.map((t) =>
          Product.updateOne(
            { _id: t.product },
            { $inc: { quantity: t.quantity } },
          ),
        ),
      );
      return res.status(err.statusCode || 500).json({ message: err.message });
    }

    // Everything from here on can still fail — a duplicate key, a validation
    // slip, the database going away. Stock is already off the shelf at this
    // point, so the whole block is guarded: if any of it throws, every unit is
    // put back before the error is returned. Without this a failure here would
    // silently destroy stock.
    let order;
    try {
      const orderNo = formatOrderNo(await nextSequence("onlineOrder"));

      order = await OnlineOrder.create({
        store,
        orderNo,
        items: lines.map((l) => ({
          product: l.product._id,
          listing: l.listing._id,
          name: l.name,
          brand: l.brand,
          price: l.price,
          quantity: l.quantity,
          lineTotal: l.lineTotal,
        })),
        customer: {
          name: customer.name.trim(),
          email: customer.email.trim().toLowerCase(),
          phone: customer.phone || "",
        },
        shippingAddress,
        subtotal,
        shipping: ship,
        tax,
        discount: disc,
        total,
        payment: { provider: "manual", reference: "", status: "unpaid" },
        status: "pending_payment",
        stockDecrementedAt: new Date(),
        clientRef: clientRef || null,
      });

      // The till writes ONE Sale row per line (Sale.products is a single
      // object, not an array), so the web does the same — otherwise the two
      // channels would not aggregate the same way in reports.
      await StockTransaction.insertMany(
        lines.map((l) => ({
          product: l.product._id,
          quantity: l.quantity,
          type: "Stock-out",
          reference: `Online order ${orderNo}`,
        })),
      ).catch(() => {
        /* the stock movement log is best-effort; the order itself is committed */
      });

      // Real time: every till, dashboard and the website itself see the new
      // stock immediately.
      for (const t of taken) {
        emit(req, "stockChanged", {
          productId: String(t.product),
          quantity: t.newQuantity,
          reason: "online-order",
        });
      }
      emit(req, "onlineOrderPlaced", { orderNo, total, items: lines.length });

      await logActivity({
        action: "Online Order",
        description: `Web order ${orderNo} for ${order.customer.name} — ${lines.length} line(s).`,
        entity: "onlineOrder",
        entityId: order._id,
        ipAddress: req.ip,
      });

      return res.status(201).json({ message: "Order placed", order });
    } catch (err) {
      // Put every unit back before reporting the failure.
      await Promise.all(
        taken.map((t) =>
          Product.updateOne(
            { _id: t.product },
            { $inc: { quantity: t.quantity } },
          ),
        ),
      ).catch(() => {
        console.error(
          "[online] CRITICAL: could not restore stock after a failed order",
          err?.message,
        );
      });
      if (order?._id)
        await OnlineOrder.deleteOne({ _id: order._id }).catch(() => {});
      return res
        .status(500)
        .json({ message: "Could not place the order", error: err.message });
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not place the order", error: error.message });
  }
};

/* ── Order emails ─────────────────────────────────────────────────────────────
 * Sent from the shop's own mailbox (the SMTP_USER configured on the server, e.g.
 * orders@theshop.com) with the shop's name as the From display name, so the
 * customer sees a branded confirmation — not a bare no-reply. Best-effort: an
 * unconfigured mailbox or a transient SMTP error must never fail a placed order,
 * which is why placeOrder calls this fire-and-forget.
 * ------------------------------------------------------------------------- */
const orderItemsTable = (order) => {
  const rows = (order.items || [])
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;">
          ${esc(item.name)}
          ${item.brand ? `<div style="font-size:12px;color:#6b7280;">${esc(item.brand)}</div>` : ""}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center;">${Number(item.quantity)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">€${money(item.lineTotal)}</td>
      </tr>`,
    )
    .join("");

  const totalRow = (label, value, opts = {}) =>
    `<tr>
      <td style="padding:2px 0;${opts.bold ? "font-weight:bold;" : "color:#6b7280;"}">${esc(label)}</td>
      <td style="padding:2px 0;text-align:right;${opts.bold ? "font-weight:bold;font-size:16px;" : ""}">${opts.negative ? "−" : ""}€${money(Math.abs(value))}</td>
    </tr>`;

  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr>
          <th style="text-align:left;padding:8px 0;border-bottom:2px solid #111827;">Item</th>
          <th style="text-align:center;padding:8px 0;border-bottom:2px solid #111827;">Qty</th>
          <th style="text-align:right;padding:8px 0;border-bottom:2px solid #111827;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px;">
      ${totalRow("Subtotal", order.subtotal)}
      ${order.discount ? totalRow("Discount", order.discount, { negative: true }) : ""}
      ${totalRow("Shipping", order.shipping)}
      ${order.tax ? totalRow("Tax", order.tax) : ""}
      ${totalRow("Total", order.total, { bold: true })}
    </table>`;
};

const shippingAddressBlock = (order) => {
  const a = order.shippingAddress || {};
  const lines = [
    a.line1,
    a.line2,
    [a.city, a.region].filter(Boolean).join(", "),
    a.postcode,
    a.country,
  ]
    .filter(Boolean)
    .map(esc)
    .join("<br>");
  return `
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;">
      <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">Delivery address</div>
      <div style="margin-top:6px;font-size:14px;line-height:1.5;">${lines || "—"}</div>
    </div>`;
};

// The shop's own name, used when the online-store settings have not been given
// one. Every customer-facing email resolves its brand as
// `business.tradingName || business.legalName || DEFAULT_BRAND_NAME`, so this is
// what a shopper sees in the From line and the subject until the shop fills in
// its trading name (Online Store -> Settings -> Business & legal).
//
// It is the real shop name rather than a placeholder for the same reason the
// storefront URL below is: one deployment serves one shop, and "Online Store"
// in a customer's inbox is not a neutral default, it is the wrong name.
const DEFAULT_BRAND_NAME = "Cliffs Of Puff";

const DEFAULT_STOREFRONT_PUBLIC_URL = "https://cliffsofpuff.com";

// APP_URL belongs to the E360 backend and must never be used for customer
// links. Only the dedicated storefront URL is accepted; the real shop domain
// is the safe fallback when that variable has not been configured.
const storefrontBase = () => {
  const configured = String(
    process.env.STOREFRONT_PUBLIC_URL || DEFAULT_STOREFRONT_PUBLIC_URL,
  ).trim();
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return DEFAULT_STOREFRONT_PUBLIC_URL;
    }
    return url.href.replace(/\/+$/, "");
  } catch {
    return DEFAULT_STOREFRONT_PUBLIC_URL;
  }
};

// A polished, self-contained order-confirmation email in the style real
// e-commerce stores send: table-based layout with inline styles only (so it
// renders in Gmail/Outlook/Apple Mail), branded header, order summary, delivery
// + payment, next steps, and a footer with the shop's own contact/business/social
// details. Everything is pulled from the online-store settings, so it's the
// website's identity end to end.
/* The shop's order terms, as an email block.
 *
 * Same words as the order confirmation screen, from the same setting
 * (settings.checkout.orderTerms), so a shop that edits its terms edits them
 * once and every place a customer reads them changes together. One rule per
 * line; blank means the shop has cleared them and nothing is rendered.
 *
 * Deliberately plain and quiet — this is the small print, not a banner. It is
 * escaped rather than sanitised because the field is plain text, and the admin
 * form offers no formatting for it.
 */
const orderTermsEmailBlock = (settings, { muted = "#6f685b", line = "#e8e3d7" } = {}) => {
  const rules = String(settings?.checkout?.orderTerms || "")
    .split("\n")
    .map((rule) => rule.trim())
    .filter(Boolean);
  if (!rules.length) return "";

  return `<div style="border-top:1px solid ${line};margin-top:22px;padding-top:16px;">
      ${rules
        .map(
          (rule) =>
            `<div style="font-size:12px;line-height:1.6;color:${muted};">${esc(rule)}</div>`,
        )
        .join("")}
    </div>`;
};

const professionalOrderEmail = (order, settings) => {
  // Palette — a clean, professional look: dark header, one teal accent, and a
  // soft highlight for the order-number strip.
  // Store brand palette: dark ink + electric lime (matches the logo & site).
  const HEADER = "#181410"; // dark header — matches the logo's black badge
  const LIME = "#bdf000"; // electric-lime brand accent (buttons/highlights)
  const SOFT = "#f0fbcf"; // soft lime tint (highlight row / icon circle)
  const INK = "#181410";
  const MUTED = "#6f685b";
  const LINE = "#e8e3d7";
  const termsBlock = orderTermsEmailBlock(settings, { muted: MUTED, line: LINE });
  const business = settings?.business || {};
  const footer = settings?.footer || {};
  const social = settings?.social || {};
  const brandName = business.tradingName || business.legalName || DEFAULT_BRAND_NAME;
  const logo = settings?.logo || "";
  const supportEmail = footer.supportEmail || "";
  const firstName = String(order.customer?.name || "there").trim().split(/\s+/)[0];
  const shopUrl = storefrontBase();
  // Logo when set, otherwise the brand name as text.
  const brandMark = logo
    ? `<img src="${esc(logo)}" alt="${esc(brandName)}" height="52" style="height:52px;width:auto;display:block;border:0;">`
    : `<span style="font-size:22px;font-weight:800;letter-spacing:0.01em;color:#ffffff;">${esc(brandName)}</span>`;

  const itemRows = (order.items || [])
    .map(
      (item) => `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid ${LINE};font-size:14px;font-weight:600;color:${INK};">
          ${esc(item.name)}
          ${item.brand ? `<div style="font-size:12px;font-weight:400;color:${MUTED};margin-top:2px;">${esc(item.brand)}</div>` : ""}
        </td>
        <td style="padding:14px 0;border-bottom:1px solid ${LINE};text-align:center;font-size:14px;color:${MUTED};">&times;${Number(item.quantity)}</td>
        <td style="padding:14px 0;border-bottom:1px solid ${LINE};text-align:right;font-size:14px;font-weight:600;color:${INK};white-space:nowrap;">&euro;${money(item.lineTotal)}</td>
      </tr>`,
    )
    .join("");

  const totalRow = (label, value, opts = {}) => `
    <tr>
      <td style="padding:4px 0;font-size:${opts.big ? "15px" : "13px"};color:${opts.big ? INK : MUTED};${opts.big ? "font-weight:700;" : ""}">${esc(label)}</td>
      <td style="padding:4px 0;text-align:right;font-size:${opts.big ? "20px" : "13px"};color:${INK};font-weight:${opts.big ? "800" : "600"};">${opts.neg ? "&minus;" : ""}&euro;${money(Math.abs(value))}</td>
    </tr>`;

  const a = order.shippingAddress || {};
  const addressHtml =
    [a.line1, a.line2, [a.city, a.region].filter(Boolean).join(", "), a.postcode, a.country]
      .filter(Boolean)
      .map(esc)
      .join("<br>") || "&mdash;";

  const socialLinks = [
    social.instagram && ["Instagram", social.instagram],
    social.facebook && ["Facebook", social.facebook],
    social.twitter && ["X", social.twitter],
    social.tiktok && ["TikTok", social.tiktok],
  ]
    .filter(Boolean)
    .map(([label, href]) => `<a href="${esc(href)}" style="color:${MUTED};text-decoration:none;">${label}</a>`)
    .join(" &nbsp;&middot;&nbsp; ");

  const businessBits = [
    business.legalName || business.tradingName,
    business.companyNumber && `Company no. ${business.companyNumber}`,
    business.vatNumber && `VAT ${business.vatNumber}`,
  ]
    .filter(Boolean)
    .map(esc)
    .join(" &middot; ");

  const orderDate = new Date(order.createdAt || Date.now()).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  // A friendly estimate — a few working days out from the order date.
  const estDelivery = new Date(
    (order.createdAt ? new Date(order.createdAt).getTime() : Date.now()) +
      3 * 24 * 60 * 60 * 1000,
  ).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Order ${esc(order.orderNo)} confirmed &mdash; thank you for shopping with ${esc(brandName)}.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">

          <!-- Header bar: brand + shop link -->
          <tr><td style="background:${HEADER};padding:20px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td>${brandMark}</td>
              <td align="right">${shopUrl ? `<a href="${esc(shopUrl)}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Shop &nbsp;&#128722;</a>` : ""}</td>
            </tr></table>
          </td></tr>

          <!-- Checkmark + thank you -->
          <tr><td align="center" style="padding:40px 36px 4px;">
            <div style="width:74px;height:74px;line-height:74px;border-radius:50%;background:${LIME};color:${INK};font-size:38px;font-weight:700;margin:0 auto;">&#10003;</div>
            <h1 style="margin:22px 0 0;font-size:27px;line-height:1.2;color:${INK};">Thank You For Your Order!</h1>
          </td></tr>
          <tr><td align="center" style="padding:12px 44px 0;">
            <p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">Hi ${esc(firstName)}, we&rsquo;ve received your order and it&rsquo;s now being prepared. Here&rsquo;s a summary of your purchase.</p>
          </td></tr>

          <!-- Highlighted order number -->
          <tr><td style="padding:26px 36px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SOFT};border-radius:10px;">
              <tr>
                <td style="padding:16px 20px;font-size:15px;font-weight:700;color:${INK};">Order Confirmation No.</td>
                <td style="padding:16px 20px;text-align:right;font-size:15px;font-weight:800;color:${INK};">#${esc(order.orderNo)}</td>
              </tr>
            </table>
          </td></tr>

          <!-- Items -->
          <tr><td style="padding:24px 36px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${MUTED};border-bottom:2px solid ${INK};">Item</td>
                <td style="padding-bottom:8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${MUTED};border-bottom:2px solid ${INK};text-align:center;">Qty</td>
                <td style="padding-bottom:8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${MUTED};border-bottom:2px solid ${INK};text-align:right;">Total</td>
              </tr>
              ${itemRows}
            </table>
          </td></tr>

          <!-- Totals -->
          <tr><td style="padding:16px 36px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${totalRow("Subtotal", order.subtotal)}
              ${order.discount ? totalRow("Discount", order.discount, { neg: true }) : ""}
              ${totalRow("Shipping + Handling", order.shipping)}
              ${order.tax ? totalRow("Sales Tax", order.tax) : ""}
              <tr><td colspan="2" style="padding-top:8px;border-top:1px solid ${LINE};"></td></tr>
              ${totalRow("Total", order.total, { big: true })}
            </table>
          </td></tr>

          <!-- Delivery address + estimated delivery -->
          <tr><td style="padding:28px 36px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="55%" valign="top" style="padding-right:12px;">
                  <div style="font-size:12px;font-weight:700;color:${INK};margin-bottom:7px;">Delivery Address</div>
                  <div style="font-size:14px;line-height:1.6;color:${MUTED};">${esc(order.customer?.name || "")}<br>${addressHtml}</div>
                </td>
                <td width="45%" valign="top" style="padding-left:12px;">
                  <div style="font-size:12px;font-weight:700;color:${INK};margin-bottom:7px;">Estimated Delivery</div>
                  <div style="font-size:14px;line-height:1.6;color:${MUTED};">${estDelivery}</div>
                  <div style="font-size:12px;font-weight:700;color:${INK};margin:14px 0 7px;">Payment</div>
                  <div style="font-size:14px;line-height:1.6;color:${MUTED};">Pick &amp; Pay &mdash; have <strong style="color:${INK};">&euro;${money(order.total)}</strong> ready on arrival.</div>
                </td>
              </tr>
            </table>
          </td></tr>

          <!-- CTA banner -->
          ${shopUrl ? `<tr><td style="padding:30px 36px 6px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${HEADER};border-radius:12px;">
              <tr><td align="center" style="padding:28px 24px;">
                <div style="font-size:19px;font-weight:800;color:#ffffff;margin-bottom:16px;">Discover more at ${esc(brandName)}.</div>
                <a href="${esc(shopUrl)}" style="display:inline-block;background:${LIME};color:${INK};text-decoration:none;font-size:14px;font-weight:800;padding:12px 28px;border-radius:8px;">Continue shopping</a>
              </td></tr>
            </table>
          </td></tr>` : ""}

          <!-- Support line -->
          <tr><td style="padding:24px 36px 6px;">
            <p style="margin:0;font-size:14px;line-height:1.6;color:${MUTED};">
              Questions? ${supportEmail ? `Reply to this email or write to <a href="mailto:${esc(supportEmail)}" style="color:${INK};font-weight:700;text-decoration:underline;">${esc(supportEmail)}</a>` : "just reply to this email"}${footer.supportPhone ? ` &middot; ${esc(footer.supportPhone)}` : ""}. Quote <strong style="color:${INK};">${esc(order.orderNo)}</strong>.
            </p>
          </td></tr>

          <!-- Footer -->
          <tr><td style="padding:12px 36px 32px;">
            <div style="border-top:1px solid ${LINE};padding-top:22px;">
              <div style="font-size:16px;font-weight:800;color:${INK};">${esc(brandName)}</div>
              ${footer.address ? `<div style="font-size:12px;color:${MUTED};margin-top:5px;">${esc(footer.address)}</div>` : ""}
              ${socialLinks ? `<div style="margin-top:11px;font-size:12px;">${socialLinks}</div>` : ""}
              ${businessBits ? `<div style="font-size:11px;color:${MUTED};margin-top:11px;">${businessBits}</div>` : ""}
              ${termsBlock}
              <!-- The age notice is not optional on a vape order, so it is
                   carried here whenever the shop's own terms are not already
                   stating it. Clearing a copy field must not quietly drop a
                   compliance line from every order email. -->
              <div style="font-size:11px;color:${MUTED};margin-top:13px;line-height:1.5;">${termsBlock ? "" : "18+ only &middot; "}Contains nicotine, a highly addictive substance. You received this email to confirm your order.</div>
            </div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
};

const shopAlertBody = (order) => `
  <p style="margin:0 0 16px;">A new online order has been placed.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:12px;">
    <tr><td style="padding:4px 0;color:#6b7280;width:110px;">Order</td><td style="padding:4px 0;font-weight:bold;">${esc(order.orderNo)}</td></tr>
    <tr><td style="padding:4px 0;color:#6b7280;">Customer</td><td style="padding:4px 0;">${esc(order.customer?.name || "")}</td></tr>
    <tr><td style="padding:4px 0;color:#6b7280;">Email</td><td style="padding:4px 0;">${esc(order.customer?.email || "")}</td></tr>
    <tr><td style="padding:4px 0;color:#6b7280;">Phone</td><td style="padding:4px 0;">${esc(order.customer?.phone || "—")}</td></tr>
    <tr><td style="padding:4px 0;color:#6b7280;">Payment</td><td style="padding:4px 0;">Pick &amp; Pay</td></tr>
  </table>
  ${orderItemsTable(order)}
  ${shippingAddressBlock(order)}`;

/* ── "Where is my order?" ───────────────────────────────────────────────────
 * A shopper gets exactly three emails per order, and no more:
 *
 *   1. placed     — "your order is confirmed"  (sendOrderEmails)
 *   2. dispatched — "your order is on its way" (here)
 *   3. delivered  — "delivered" + the invitation to review it (here)
 *
 * Three, because a message for every internal state change trains people to
 * ignore the ones that matter. "Packed and ready" used to send a fourth: it is
 * news to the shop, not to somebody waiting on a parcel, so it is gone. And
 * delivery used to send two — a status email and a separate review request,
 * back to back, from the same address about the same order. They are one email
 * now, with the review as its call to action.
 * ------------------------------------------------------------------------- */

const STATUS_EMAIL = {
  shipped: {
    subject: (order) => `Your order ${order.orderNo} is on its way`,
    heading: "Your order is on its way",
    body: "It has left us and is with the courier now.",
  },
  delivered: {
    subject: (order) => `Your order ${order.orderNo} has been delivered`,
    heading: "Delivered",
    body: "Your order has been marked as delivered. We hope everything is as you expected.",
  },
};

/* Claim the right to ask this customer for a review, once.
 *
 * Returns the tokenised link, or "" if the invitation has already gone out —
 * the update only matches an order whose reviewRequestedAt is still null, so a
 * retried or duplicated delivered-transition cannot invite twice. The caller
 * MUST release it (releaseReviewClaim) if the send then fails, or the order is
 * left marked as invited for an email nobody received.
 */
const claimReviewLink = async (order) => {
  const token = crypto.randomBytes(24).toString("hex");
  const claimed = await OnlineOrder.findOneAndUpdate(
    { _id: order._id, reviewRequestedAt: null },
    { $set: { reviewToken: token, reviewRequestedAt: new Date() } },
    { new: true },
  ).lean();
  if (!claimed) return "";
  return `${storefrontBase()}/review/${encodeURIComponent(claimed.orderNo)}/${token}`;
};

// The token is deliberately kept, so the link already generated stays valid if
// the same invitation is sent later.
const releaseReviewClaim = (order) =>
  OnlineOrder.updateOne({ _id: order._id }, { $set: { reviewRequestedAt: null } });

// `injectedSettings` is only ever passed by scripts/verifyOrderEmails.js, so
// the email flow can be exercised without a database. Production always leaves
// it out and the settings are fetched as before.
const sendOrderStatusEmail = async (store, order, injectedSettings = null) => {
  const copy = STATUS_EMAIL[order.status];
  if (!copy || !order.customer?.email) return;

  const settings = injectedSettings || (await getOrCreateSettings(store));
  const brand = {
    name:
      settings?.business?.tradingName ||
      settings?.business?.legalName ||
      DEFAULT_BRAND_NAME,
    addressLines: settings?.footer?.address ? [settings.footer.address] : [],
    phone: settings?.footer?.supportPhone || "",
  };
  const firstName = String(order.customer.name || "there").trim().split(/\s+/)[0];
  const shopUrl = storefrontBase();

  // The last note the shop left on this order, if it left one. It was written
  // for the customer, so it belongs in the email they actually read rather than
  // only on a page they have to go and find.
  const lastNote = [...(order.timeline || [])]
    .reverse()
    .find((entry) => entry.status === order.status && entry.note)?.note;

  const tracking = order.tracking || {};
  const trackingRows = [
    tracking.carrier ? ["Carrier", tracking.carrier] : null,
    tracking.number ? ["Tracking number", tracking.number] : null,
    tracking.estimate ? ["Expected", tracking.estimate] : null,
  ].filter(Boolean);

  const trackingBlock = trackingRows.length
    ? `<div style="margin:20px 0;padding:14px 16px;background:#f0fbcf;">
         ${trackingRows
           .map(
             ([label, value]) =>
               `<div style="font-size:14px;line-height:1.7;"><span style="color:#6f685b;">${esc(label)}:</span> <strong>${esc(value)}</strong></div>`,
           )
           .join("")}
         ${
           tracking.url
             ? `<div style="margin-top:10px;"><a href="${esc(tracking.url)}" style="color:#181410;font-weight:600;">Track your parcel</a></div>`
             : ""
         }
       </div>`
    : "";

  const points = Number(order.loyalty?.earned || 0);
  const pointsBlock =
    order.status === "delivered" && points > 0
      ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">You've earned <strong>${points}</strong> ${esc(loyalty.programme(settings).pointsName)} on this order — they're in your account now.</p>`
      : "";

  /* The review invitation, folded into the delivered email rather than sent as
   * a second one. Claimed before the send so a duplicate transition cannot ask
   * twice; released below if the send fails. */
  const reviewLink =
    order.status === "delivered" ? await claimReviewLink(order) : "";
  const reviewBlock = reviewLink
    ? `<div style="margin:24px 0 4px;padding:20px;background:#f7f5ef;text-align:center;">
         <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">How did we do? A quick review helps other shoppers and takes less than a minute.</p>
         <a href="${esc(reviewLink)}" style="display:inline-block;background:#c5ff32;color:#181410;text-decoration:none;font-size:15px;font-weight:800;padding:14px 34px;border-radius:8px;">Write a review</a>
       </div>`
    : "";

  const sent = await sendMail({
    to: order.customer.email,
    subject: copy.subject(order),
    account: "store",
    fromName: brand.name,
    html: brandedHtml(
      brand,
      `<h2 style="margin:0 0 12px;font-size:20px;">${esc(copy.heading)}</h2>
       <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Hi ${esc(firstName)}, ${esc(copy.body)}</p>
       <p style="margin:0 0 6px;font-size:13px;color:#6f685b;text-transform:uppercase;letter-spacing:.06em;">Order</p>
       <p style="margin:0 0 14px;font-size:18px;font-weight:700;">${esc(order.orderNo)}</p>
       ${lastNote ? `<p style="margin:0 0 14px;padding:12px 14px;background:#f7f5ef;font-size:14px;line-height:1.6;">${esc(lastNote)}</p>` : ""}
       ${trackingBlock}
       ${pointsBlock}
       <p style="margin:0;font-size:15px;line-height:1.6;">
         <a href="${shopUrl}/account/orders/${encodeURIComponent(order.orderNo)}" style="color:#181410;font-weight:600;">Track this order</a>
       </p>
       ${reviewBlock}
       ${orderTermsEmailBlock(settings)}`,
    ),
  });

  // If the mail did not go out, the customer has not been invited to review
  // anything — give the claim back so a retry can still ask them.
  if (reviewLink && !sent?.ok) {
    await releaseReviewClaim(order).catch(() => {});
  }

  /* Say plainly what happened, and record it on the order.
   *
   * sendMail resolves { ok: false } rather than throwing, so the caller's
   * .catch() cannot see a refused or timed-out message. Without this, a
   * dispatch email that never left the building looked exactly like one that
   * arrived, and "did the customer get told?" had no answer anywhere.
   *
   * The stamp is written only on a confirmed send, and best-effort: failing to
   * record an email that DID go out must not make the shop send it again. */
  if (sent?.ok) {
    console.log(
      `[online] ${order.status} email sent to ${order.customer.email} for order ${order.orderNo}`,
    );
    await OnlineOrder.updateOne(
      { _id: order._id },
      { $set: { [`statusEmails.${order.status}`]: new Date() } },
    ).catch((error) =>
      console.error("[online] could not stamp status email:", error.message),
    );
  } else {
    console.error(
      `[online] ${order.status} email NOT sent for order ${order.orderNo}:`,
      sent?.skipped ? sent.reason : sent?.error || "unknown",
    );
  }

  return sent;
};

const sendOrderEmails = async (store, order) => {
  try {
    const [shop, settings] = await Promise.all([
      Store.findById(store).lean(),
      getOrCreateSettings(store),
    ]);
    const supportEmail = settings?.footer?.supportEmail || "";
    // The ONLINE STORE's own identity — deliberately independent of the
    // POS/inventory Store (which brands till receipts and reorder alerts). A
    // shopper's confirmation carries the website brand + website contact, never
    // the back-office name. Set from the online-store settings (Business & legal
    // → Trading name, Footer & contact → address/phone).
    const brand = {
      name:
        settings?.business?.tradingName ||
        settings?.business?.legalName ||
        DEFAULT_BRAND_NAME,
      addressLines: settings?.footer?.address ? [settings.footer.address] : [],
      phone: settings?.footer?.supportPhone || "",
    };

    if (order.customer?.email) {
      await sendMail({
        to: order.customer.email,
        subject: `Your ${brand.name} order ${order.orderNo} is confirmed`,
        html: professionalOrderEmail(order, settings),
        fromName: brand.name,
        // Customer-facing → from the store's own mailbox (store SMTP account).
        account: "store",
      });
    }

    const shopInbox = supportEmail || shop?.notificationsEmail || "";
    if (shopInbox) {
      await sendMail({
        to: shopInbox,
        subject: `New online order — ${order.orderNo} (€${money(order.total)})`,
        html: brandedHtml(brand, shopAlertBody(order)),
        fromName: brand.name,
        // Internal alert → system account (default), kept explicit for clarity.
        account: "system",
      });
    }
  } catch (error) {
    console.error("[online] order emails failed:", error.message);
  }
};

/* ───────────────────────────────────────── REVIEWS ──────────────────────────
 * Verified-purchase reviews. The only way to create one is the tokenised link
 * emailed after an order is delivered, so a review always maps to a real,
 * received purchase.
 * ------------------------------------------------------------------------- */

// Resolve the online-store brand (name/address/phone) the same way order
// confirmations do, so review emails carry the website's identity.
const onlineBrand = (settings) => ({
  name:
    settings?.business?.tradingName ||
    settings?.business?.legalName ||
    DEFAULT_BRAND_NAME,
  addressLines: settings?.footer?.address ? [settings.footer.address] : [],
  phone: settings?.footer?.supportPhone || "",
});

// The "leave a review" email — same branded shell as the order confirmation so
// every message from the shop looks like one store.
const reviewRequestEmail = (order, link, brand, settings) => {
  // Store brand palette: dark ink + electric lime (matches the logo & site).
  const HEADER = "#181410";
  const LIME = "#bdf000";
  const SOFT = "#f0fbcf";
  const INK = "#181410";
  const MUTED = "#6f685b";
  const LINE = "#e8e3d7";
  const footer = settings?.footer || {};
  const brandName = brand.name;
  const logo = settings?.logo || "";
  const shopUrl = storefrontBase();
  const firstName = String(order.customer?.name || "there").trim().split(/\s+/)[0];
  const brandMark = logo
    ? `<img src="${esc(logo)}" alt="${esc(brandName)}" height="52" style="height:52px;width:auto;display:block;border:0;">`
    : `<span style="font-size:22px;font-weight:800;color:#ffffff;">${esc(brandName)}</span>`;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
          <tr><td style="background:${HEADER};padding:20px 36px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td>${brandMark}</td>
              <td align="right">${shopUrl ? `<a href="${esc(shopUrl)}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Shop &nbsp;&#128722;</a>` : ""}</td>
            </tr></table>
          </td></tr>

          <tr><td align="center" style="padding:40px 36px 4px;">
            <div style="width:74px;height:74px;line-height:74px;border-radius:50%;background:${SOFT};color:#f59e0b;font-size:34px;margin:0 auto;">&#9733;</div>
            <h1 style="margin:22px 0 0;font-size:26px;line-height:1.2;color:${INK};">How was your order?</h1>
          </td></tr>
          <tr><td align="center" style="padding:12px 44px 0;">
            <p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">Hi ${esc(firstName)}, thanks for your order <strong style="color:${INK};">#${esc(order.orderNo)}</strong> — we hope you're loving it! A quick review helps other shoppers and takes less than a minute.</p>
          </td></tr>

          <tr><td align="center" style="padding:28px 36px 4px;">
            <a href="${esc(link)}" style="display:inline-block;background:${LIME};color:${INK};text-decoration:none;font-size:15px;font-weight:800;padding:14px 34px;border-radius:8px;">Write a review</a>
          </td></tr>
          <tr><td align="center" style="padding:16px 44px 30px;">
            <p style="margin:0;color:${MUTED};font-size:12px;line-height:1.5;">If the button doesn't work, paste this link into your browser:<br><span style="color:${INK};">${esc(link)}</span></p>
          </td></tr>

          <tr><td style="padding:0 36px 32px;">
            <div style="border-top:1px solid ${LINE};padding-top:22px;">
              <div style="font-size:16px;font-weight:800;color:${INK};">${esc(brandName)}</div>
              ${footer.address ? `<div style="font-size:12px;color:${MUTED};margin-top:5px;">${esc(footer.address)}</div>` : ""}
              <div style="font-size:11px;color:${MUTED};margin-top:13px;line-height:1.5;">18+ only &middot; Contains nicotine, a highly addictive substance. You received this email because you placed an order with us.</div>
            </div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
};

// Exposed so scripts (resend / preview) build the identical branded emails.
// Shared with controller/onlineCustomerController: the tenant scope and the
// settings document are the same two things every online route needs, and there
// is no version of this feature where the customer side should resolve them
// differently from the store side.
module.exports.storeId = storeId;
module.exports.getOrCreateSettings = getOrCreateSettings;
// Same reason: the customer emails and the resend script brand themselves the
// way the order emails do, and must not carry their own copy of the name.
module.exports.DEFAULT_BRAND_NAME = DEFAULT_BRAND_NAME;
/* Exposed for scripts/verifyOrderEmails.js, which checks that a shopper still
 * gets exactly three emails per order. Not part of the controller's API — the
 * app never reaches for this. */
module.exports.__emailInternals = { STATUS_EMAIL, sendOrderStatusEmail };

module.exports.reviewRequestEmail = reviewRequestEmail;
module.exports.professionalOrderEmail = professionalOrderEmail;
module.exports.formatOrderNo = formatOrderNo;

/* The standalone "leave a review" email is gone.
 *
 * It used to be sent on delivery, immediately after the delivered status email
 * — two messages from the same address about the same order, seconds apart.
 * The invitation now rides inside the delivered email (see sendOrderStatusEmail),
 * which is where somebody who has just received their parcel will actually read
 * it. The reviewRequestEmail TEMPLATE is still exported above, because
 * scripts/resendReviewEmails.js sends it by hand to orders that were delivered
 * before any of this existed. */


// Resolve the OnlineListing for an order item — items usually carry it, but
// legacy rows may only have the product, so fall back to a lookup.
async function listingForItem(store, item) {
  if (item.listing) return item.listing;
  const found = await OnlineListing.findOne({ store, product: item.product })
    .select("_id")
    .lean();
  return found?._id || null;
}

// STOREFRONT — published reviews + summary for a product page.
module.exports.storefrontProductReviews = async (req, res) => {
  try {
    const store = await storeId();
    const listing = await OnlineListing.findOne({
      store,
      slug: String(req.params.slug).toLowerCase(),
    })
      .select("_id")
      .lean();
    if (!listing) return res.status(200).json({ reviews: [], summary: { average: 0, count: 0, breakdown: {} } });

    const reviews = await OnlineReview.find({
      store,
      listing: listing._id,
      status: "published",
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const r of reviews) {
      breakdown[r.rating] = (breakdown[r.rating] || 0) + 1;
      sum += r.rating;
    }
    const count = reviews.length;
    return res.status(200).json({
      reviews: reviews.map((r) => ({
        id: String(r._id),
        name: r.customerName,
        rating: r.rating,
        title: r.title,
        body: r.body,
        verified: r.verified,
        createdAt: r.createdAt,
      })),
      summary: {
        average: count ? Math.round((sum / count) * 10) / 10 : 0,
        count,
        breakdown,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load reviews", error: error.message });
  }
};

// STOREFRONT — validate a review link and return the items still to review.
// Always 200 with a `state` so the review page can tell an invalid link apart
// from an already-completed one (the storefront's fetch helper swallows non-2xx
// into a fallback, which would otherwise flatten those cases together).
module.exports.storefrontReviewContext = async (req, res) => {
  const empty = (state) => ({ state, customerName: "", orderNo: "", items: [] });
  try {
    const store = await storeId();
    const { order: orderNo, token } = req.query;
    if (!orderNo || !token) return res.status(200).json(empty("invalid"));
    const order = await OnlineOrder.findOne({
      store,
      orderNo: String(orderNo),
      reviewToken: String(token),
    }).lean();
    if (!order) return res.status(200).json(empty("invalid"));
    if (order.status !== "delivered")
      return res.status(200).json(empty("not_delivered"));

    const done = await OnlineReview.find({ order: order._id })
      .select("product")
      .lean();
    const reviewed = new Set(done.map((r) => String(r.product)));

    const items = [];
    for (const item of order.items) {
      if (reviewed.has(String(item.product))) continue;
      const listingId = await listingForItem(store, item);
      if (!listingId) continue;
      const listing = await OnlineListing.findById(listingId)
        .select("slug webName gallery")
        .populate("product", "image name")
        .lean();
      items.push({
        productId: String(item.product),
        listingId: String(listingId),
        slug: listing?.slug || "",
        name: item.name,
        image: listing?.gallery?.[0]?.url || listing?.product?.image?.url || "",
      });
    }

    return res.status(200).json({
      state: items.length ? "ok" : "done",
      customerName: order.customer?.name || "",
      orderNo: order.orderNo,
      items,
    });
  } catch (error) {
    return res.status(200).json(empty("invalid"));
  }
};

// STOREFRONT — create a verified review from a valid review link.
module.exports.submitStorefrontReview = async (req, res) => {
  try {
    const store = await storeId();
    const { order: orderNo, token, productId, rating, title, body } = req.body || {};
    const stars = Math.round(Number(rating));
    if (!orderNo || !token)
      return res.status(400).json({ message: "Missing review link details" });
    if (!(stars >= 1 && stars <= 5))
      return res.status(400).json({ message: "Please choose a rating from 1 to 5 stars." });

    const order = await OnlineOrder.findOne({
      store,
      orderNo: String(orderNo),
      reviewToken: String(token),
    }).lean();
    if (!order)
      return res.status(404).json({ message: "This review link is invalid or has expired." });
    if (order.status !== "delivered")
      return res.status(409).json({ message: "This order isn't marked delivered yet." });

    const item = order.items.find((i) => String(i.product) === String(productId));
    if (!item)
      return res.status(400).json({ message: "That product isn't part of this order." });
    const listingId = await listingForItem(store, item);
    if (!listingId)
      return res.status(400).json({ message: "This product is no longer on the store." });

    try {
      const review = await OnlineReview.create({
        store,
        listing: listingId,
        product: item.product,
        order: order._id,
        orderNo: order.orderNo,
        customerName: order.customer?.name || "Verified buyer",
        customerEmail: order.customer?.email || "",
        rating: stars,
        title: String(title || "").trim().slice(0, 120),
        body: String(body || "").trim().slice(0, 2000),
        verified: true,
        status: "published",
      });
      // A thank-you in points, if the shop offers one. Paid once per review,
      // which the unique index above already enforces — the duplicate is caught
      // as a 11000 below and never reaches this line, so nobody can farm the
      // bonus by submitting the same review twice.
      //
      // Only for a signed-in shopper: the bonus has to land in an account, and
      // a guest who reviewed through an emailed link does not have one. Best
      // effort either way — a review is worth having whether or not the points
      // went through.
      let bonusAwarded = 0;
      if (order.customer?.account) {
        try {
          const settings = await getOrCreateSettings(store);
          const config = loyalty.programme(settings);
          if (config.enabled && config.reviewBonus > 0) {
            await loyalty.postEntry({
              store,
              customer: order.customer.account,
              kind: "bonus",
              points: config.reviewBonus,
              reason: `Thanks for reviewing ${item.name}`,
              order: order._id,
              orderNo: order.orderNo,
              settings,
            });
            bonusAwarded = config.reviewBonus;
          }
        } catch (error) {
          console.error("[loyalty] review bonus failed:", error.message);
        }
      }

      return res.status(201).json({
        message: bonusAwarded
          ? `Thanks for your review! ${bonusAwarded} points are on your account.`
          : "Thanks for your review!",
        id: String(review._id),
        pointsAwarded: bonusAwarded,
      });
    } catch (error) {
      if (error.code === 11000)
        return res.status(409).json({ message: "You've already reviewed this item." });
      throw error;
    }
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not save your review", error: error.message });
  }
};

// ADMIN — moderate reviews.
module.exports.listReviews = async (req, res) => {
  try {
    const store = await storeId();
    const filter = { store };
    if (req.query.status === "published" || req.query.status === "hidden")
      filter.status = req.query.status;
    const reviews = await OnlineReview.find(filter)
      .populate("listing", "slug webName")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    return res.status(200).json({
      reviews: reviews.map((r) => ({
        _id: String(r._id),
        product: r.listing?.webName || r.orderNo,
        slug: r.listing?.slug || "",
        orderNo: r.orderNo,
        customerName: r.customerName,
        rating: r.rating,
        title: r.title,
        body: r.body,
        verified: r.verified,
        status: r.status,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load reviews", error: error.message });
  }
};

module.exports.updateReview = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid review id" });
    const store = await storeId();
    const status = req.body.status;
    if (!["published", "hidden"].includes(status))
      return res.status(400).json({ message: "Status must be published or hidden" });
    const review = await OnlineReview.findOneAndUpdate(
      { _id: req.params.id, store },
      { status },
      { new: true },
    ).lean();
    if (!review) return res.status(404).json({ message: "Review not found" });
    return res.status(200).json({ message: `Review ${status}`, review: { _id: String(review._id), status: review.status } });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not update review", error: error.message });
  }
};

module.exports.deleteReview = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid review id" });
    const store = await storeId();
    const deleted = await OnlineReview.findOneAndDelete({
      _id: req.params.id,
      store,
    });
    if (!deleted) return res.status(404).json({ message: "Review not found" });
    return res.status(200).json({ message: "Review deleted", id: req.params.id });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not delete review", error: error.message });
  }
};

// Voucher-aware checkout. This supersedes the original implementation above
// while preserving its guarded, shared-inventory decrement behavior.
// Put back stock that was taken for an order that then failed to complete.
// Checkout takes stock one line at a time so it can fail fast on a sold-out
// item; every failure path after that point has to hand back exactly what it
// took, and doing it in one place means a new failure path cannot forget to.
const releaseStock = (taken) =>
  Promise.all(
    (taken || []).map((item) =>
      Product.updateOne(
        { _id: item.product },
        { $inc: { quantity: item.quantity } },
      ),
    ),
  );

module.exports.placeOrder = async (req, res) => {
  try {
    const store = await storeId();
    const {
      items,
      customer,
      shippingAddress = {},
      clientRef,
      voucherCode,
      paymentMethod,
      // Points the shopper asked to spend on this basket. A request, not an
      // instruction: what is actually allowed comes off their real balance and
      // the programme's own limits, never off this number.
      redeemPoints = 0,
    } = req.body;

    // Set by optionalCustomerAuth when the shopper was signed in. Null is a
    // guest checkout, which stays a first-class way to buy.
    const account = req.customer || null;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "The order has no items" });
    }
    if (!customer?.name?.trim() || !customer?.email?.trim()) {
      return res
        .status(400)
        .json({ message: "Customer name and email are required" });
    }
    if (paymentMethod !== "cash_on_delivery") {
      return res.status(400).json({
        message: "Pick & Pay is the available payment method",
      });
    }
    if (clientRef) {
      const existing = await OnlineOrder.findOne({ clientRef }).lean();
      if (existing) {
        return res.status(200).json({
          message: "Order already placed",
          order: existing,
          idempotent: true,
        });
      }
    }

    const lines = await resolveOrderLines(store, items);
    const subtotal = money(lines.reduce((sum, line) => sum + line.subtotal, 0));
    let voucher = null;
    let voucherResult = null;
    if (String(voucherCode || "").trim()) {
      voucher = await OnlineVoucher.findOne({
        store,
        code: String(voucherCode).trim().toUpperCase(),
      });
      if (!voucher) throw requestError(404, "Voucher code not found");
      voucherResult = await evaluateVoucher(voucher, lines, customer.email);
      allocateDiscount(
        lines,
        voucherResult.eligibleLines,
        voucherResult.discount,
      );
    }

    const voucherDiscount = money(voucherResult?.discount || 0);
    const tax = 0;
    const settings = await getOrCreateSettings(store);

    /* Set offers — "any 3 for 10", mixed across flavours.
     *
     * Priced from the resolved lines, which carry server-owned prices, never
     * the browser's, and capped at what is left after the voucher so the two
     * together can never give away more than the basket is worth.
     *
     * Judged on the WHOLE basket. A shopper who found two of the five through
     * search and three from the category page has five, and the offer was for
     * five. Only deals the shop has placed on an events card are considered —
     * see libs/onlineDeals for why that is deliberate. */
    const dealRoom = Math.max(subtotal - voucherDiscount, 0);
    const dealResult = await dealsForBasket(settings, lines, dealRoom);
    const dealDiscount = money(dealResult.discount);

    const discount = money(voucherDiscount + dealDiscount);
    const merchandiseTotal = money(subtotal - discount);

    // Shipping is worked out on the merchandise value BEFORE any points are
    // spent. Spending a reward should never cost somebody their free delivery —
    // that turns the reward into a trap, and it is the kind of thing a customer
    // notices exactly once and never forgets.
    const shipping = shippingFor(settings, merchandiseTotal);

    /* ── Points ───────────────────────────────────────────────────────────
     * Only a signed-in shopper can spend them, and only what they actually
     * hold. The quote clamps the request against the balance, the programme's
     * per-order ceiling and its minimum; the atomic reservation below is what
     * makes it safe against the same account checking out twice at once.
     * ------------------------------------------------------------------- */
    let pointsSpent = 0;
    let pointsValue = 0;
    if (account && Number(redeemPoints) > 0) {
      const quote = loyalty.quoteRedemption({
        settings,
        balance: account.points?.balance || 0,
        merchandiseTotal,
        requestedPoints: redeemPoints,
      });
      pointsSpent = quote.points;
      pointsValue = quote.value;
    }

    const total = money(merchandiseTotal + shipping - pointsValue);

    // POS and web compete on this exact Product.quantity guard. If either
    // channel buys the final unit first, the other channel receives a conflict.
    const taken = [];
    try {
      for (const line of lines) {
        const product = await Product.findOneAndUpdate(
          { _id: line.product._id, quantity: { $gte: line.quantity } },
          { $inc: { quantity: -line.quantity } },
          { new: true },
        );
        if (!product) {
          throw requestError(
            409,
            `${line.name} sold out while the order was being placed`,
          );
        }
        taken.push({
          product: product._id,
          quantity: line.quantity,
          newQuantity: product.quantity,
        });
      }
    } catch (error) {
      await releaseStock(taken);
      throw error;
    }

    let voucherReserved = false;
    if (voucher) {
      const now = new Date();
      const conditions = [
        { _id: voucher._id, store, active: true },
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ];
      if (voucher.usageLimit != null) {
        conditions.push({ usedCount: { $lt: voucher.usageLimit } });
      }
      const reserved = await OnlineVoucher.findOneAndUpdate(
        { $and: conditions },
        { $inc: { usedCount: 1 } },
        { new: true },
      );
      if (!reserved) {
        await releaseStock(taken);
        throw requestError(409, "This voucher is no longer available");
      }
      voucherReserved = true;
    }

    // Take the points off the balance BEFORE the order exists, under a
    // condition on the balance itself. This is the same guard the stock take
    // above uses, for the same reason: two checkouts on one account at the same
    // moment must not both be told they can spend the same 500 points.
    let pointsReserved = false;
    if (pointsSpent > 0) {
      const charged = await OnlineCustomer.findOneAndUpdate(
        { _id: account._id, "points.balance": { $gte: pointsSpent } },
        { $inc: { "points.balance": -pointsSpent } },
        { new: true },
      );
      if (!charged) {
        await releaseStock(taken);
        if (voucherReserved) {
          await OnlineVoucher.updateOne(
            { _id: voucher._id, usedCount: { $gt: 0 } },
            { $inc: { usedCount: -1 } },
          ).catch(() => {});
        }
        throw requestError(
          409,
          "Those points are no longer available — refresh and try again",
        );
      }
      pointsReserved = true;
    }

    let order;
    try {
      const orderNo = formatOrderNo(await nextSequence("onlineOrder"));
      order = await OnlineOrder.create({
        store,
        orderNo,
        items: lines.map((line) => ({
          product: line.product._id,
          listing: line.listing._id,
          name: line.name,
          brand: line.brand,
          price: line.price,
          quantity: line.quantity,
          subtotal: line.subtotal,
          discount: line.discount,
          lineTotal: line.lineTotal,
        })),
        customer: {
          name: customer.name.trim(),
          email: customer.email.trim().toLowerCase(),
          phone: customer.phone || "",
          // Set only when the shopper was signed in. The name/email/phone above
          // stay a snapshot of what was typed at checkout — somebody who later
          // renames their profile has not changed who this parcel was addressed
          // to.
          account: account?._id || null,
        },
        shippingAddress,
        subtotal,
        /* What each offer gave, kept with the order the way the voucher
         * snapshot above is: a deal gets renamed, retired or taken off the
         * website, and an order from last month still has to be able to say
         * what it gave and why. Their sum is inside `discount`. */
        deals: (dealResult.applied || []).map((entry) => ({
          id: entry.dealId,
          name: entry.name,
          sets: entry.sets,
          amount: entry.amount,
        })),

        shipping,
        tax,
        discount,
        total,
        voucher: voucher
          ? {
              id: voucher._id,
              code: voucher.code,
              name: voucher.name,
              discountType: voucher.discountType,
              value: voucher.value,
            }
          : undefined,
        // "Pick & Pay" is what the shop calls this at checkout; the stored
        // provider/method keep their original spelling so that orders placed
        // before the rename still read back as the same payment method.
        payment: {
          provider: "cod",
          method: "cash_on_delivery",
          reference: "",
          status: "unpaid",
        },
        // Pick & Pay is confirmed immediately for fulfilment. Revenue is posted to
        // the shared Sale ledger only when the order is marked delivered.
        status: "processing",
        // The first step of the customer's tracker. Written here rather than
        // inferred from createdAt, so the timeline has one shape from the very
        // first entry and the tracker never has to special-case its own start.
        timeline: [{ status: "processing", at: new Date(), note: "" }],
        loyalty: {
          // Filled in below, once the earning has been priced against the
          // order that now exists.
          earned: 0,
          redeemed: pointsSpent,
          redeemedValue: pointsValue,
        },
        stockDecrementedAt: new Date(),
        clientRef: clientRef || null,
      });

      await StockTransaction.insertMany(
        lines.map((line) => ({
          product: line.product._id,
          quantity: line.quantity,
          type: "Stock-out",
          reference: `Online order ${orderNo}`,
        })),
      ).catch(() => {});

      /* ── The order's loyalty movements ─────────────────────────────────
       * Both rows are written only now, once the order exists to point at —
       * a ledger entry attached to nothing is a ledger entry nobody can
       * explain later.
       *
       * The redemption is recorded as already spent, because the balance was
       * charged before the order was created. The earning is written PENDING:
       * the customer sees it as "on the way" and cannot spend it until the
       * goods have actually arrived.
       * --------------------------------------------------------------- */
      if (account) {
        if (pointsSpent > 0) {
          await loyalty.postEntry({
            store,
            customer: account,
            kind: "redeem",
            points: -pointsSpent,
            status: "confirmed",
            // The reservation above already took these off the balance under a
            // condition, so the row records the movement without repeating it.
            alreadyApplied: true,
            order: order._id,
            orderNo,
            reason: `Spent on order ${orderNo}`,
            value: pointsValue,
            settings,
          }).catch((error) =>
            console.error("[loyalty] redeem row failed:", error.message),
          );
        }

        try {
          const rules = await loyalty.activeRules(store);
          const tier = loyalty.tierFor(settings, account.points?.lifetime || 0);
          const earning = loyalty.quoteEarning({
            settings,
            rules,
            lines,
            shipping,
            tierMultiplier: tier.multiplier,
          });
          if (earning.points > 0) {
            await loyalty.postEntry({
              store,
              customer: account,
              kind: "earn",
              points: earning.points,
              status: "pending",
              order: order._id,
              orderNo,
              reason: `Earned on order ${orderNo}`,
              breakdown: earning.breakdown,
              settings,
            });
            order.loyalty.earned = earning.points;
            await order.save();
          }
        } catch (error) {
          // The sale is done and the goods are gone. A loyalty programme that
          // could refuse an order it has already taken payment for would be a
          // worse feature than one that occasionally needs a point adjustment.
          console.error("[loyalty] earning failed:", error.message);
        }

        refreshOrderStats(account._id).catch(() => {});
      }

      for (const item of taken) {
        emit(req, "stockChanged", {
          productId: String(item.product),
          quantity: item.newQuantity,
          reason: "online-order",
        });
      }
      emit(req, "onlineOrderPlaced", { orderNo, total, items: lines.length });
      await logActivity({
        action: "Online Order",
        description: `Web order ${orderNo} for ${order.customer.name} — ${lines.length} line(s).`,
        entity: "onlineOrder",
        entityId: order._id,
        ipAddress: req.ip,
      });
      // Confirmation to the customer + alert to the shop, from the shop's own
      // mailbox. Fire-and-forget so a slow or unconfigured mailbox never delays
      // or fails a placed order.
      sendOrderEmails(store, order).catch(() => {});
      return res.status(201).json({ message: "Order placed", order });
    } catch (error) {
      await Promise.all(
        taken.map((item) =>
          Product.updateOne(
            { _id: item.product },
            { $inc: { quantity: item.quantity } },
          ),
        ),
      ).catch(() => {
        console.error(
          "[online] CRITICAL: could not restore stock",
          error?.message,
        );
      });
      if (voucherReserved) {
        await OnlineVoucher.updateOne(
          { _id: voucher._id, usedCount: { $gt: 0 } },
          { $inc: { usedCount: -1 } },
        ).catch(() => {
          console.error(
            "[online] CRITICAL: could not restore voucher usage",
            error?.message,
          );
        });
      }
      // Points were taken off the balance before the order was written. If the
      // order never happened, they were never spent — give them straight back,
      // and shout about it in the log if even that fails, because the customer
      // is now short of something they can see on their own account page.
      if (pointsReserved) {
        await OnlineCustomer.updateOne(
          { _id: account._id },
          { $inc: { "points.balance": pointsSpent } },
        ).catch(() => {
          console.error(
            "[online] CRITICAL: could not restore loyalty points",
            error?.message,
          );
        });
      }
      if (order?._id)
        await OnlineOrder.deleteOne({ _id: order._id }).catch(() => {});
      throw error;
    }
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.statusCode ? error.message : "Could not place the order",
      error: error.message,
    });
  }
};
