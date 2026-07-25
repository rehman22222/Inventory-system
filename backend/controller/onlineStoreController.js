const mongoose = require("mongoose");
const OnlineCategory = require("../models/OnlineCategorymodel");
const OnlineListing = require("../models/OnlineListingmodel");
const OnlineHeroSlide = require("../models/OnlineHeroSlidemodel");
const OnlineOrder = require("../models/OnlineOrdermodel");
const OnlineVoucher = require("../models/OnlineVouchermodel");
const OnlineStoreSetting = require("../models/OnlineStoreSettingmodel");
const Product = require("../models/Productmodel");
const Sale = require("../models/Salesmodel");
const StockTransaction = require("../models/StockTranscationmodel");
const Store = require("../models/Storemodel");
const Category = require("../models/ Categorymodel");
const { nextSequence } = require("../models/Countermodel");
const logActivity = require("../libs/logger");
const { sendMail, brandedHtml, esc } = require("../libs/mailer");

// Same rounding the till uses, so a web total and a counter total can never
// disagree by a stray fraction of a cent.
const money = (value) => Math.round(Number(value || 0) * 100) / 100;
const FREE_SHIPPING_THRESHOLD = 50;
const SHIPPING_FLAT = 4.99;

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

const emit = (req, event, payload) => {
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

// A scheduled sale is presentation/pricing owned by OnlineListing. Product.Price
// remains the POS/inventory price and is never written by this controller.
const effectiveItemPrice = (listing, product, variant = null) =>
  saleIsActive(listing)
    ? Number(listing.salePrice)
    : regularItemPrice(listing, product, variant);

/* Shape a listing + its product into what the storefront renders. */
const publicListing = (l) => {
  const p = l.product;
  if (!p) return null;
  const activeSale = saleIsActive(l);
  const variants = (l.variants || [])
    .filter((variant) => variant.product && variant.product._id)
    .map((variant) => ({
      productId: String(variant.product._id),
      label: variant.label,
      kind: variant.kind || "option",
      price: money(effectiveItemPrice(l, variant.product, variant)),
      regularPrice: money(regularItemPrice(l, variant.product, variant)),
      stock: Number(variant.product.quantity || 0),
      image: variant.image || "",
    }));
  const prices = variants.length
    ? variants.map((variant) => variant.price)
    : [money(effectiveItemPrice(l, p))];
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

  return {
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
    short: l.shortDescription,
    description: l.description,
    image: l.gallery?.[0]?.url || p.image?.url || "",
    gallery: l.gallery || [],
    specs: l.specs instanceof Map ? Object.fromEntries(l.specs) : l.specs || {},
    flavour: l.flavour,
    optionLabel: l.optionLabel || "",
    variants,
    tags,
    price,
    regularPrice,
    compareAt: compareAt > price ? compareAt : null,
    sale: activeSale,
    saleEndsAt: activeSale && l.saleEndsAt ? l.saleEndsAt : null,
    publishedAt: l.createdAt,
    // Live from the shared ledger — the same number the till reads.
    stock,
    featured: l.featured,
  };
};

const requestError = (statusCode, message, extra = {}) =>
  Object.assign(new Error(message), { statusCode, ...extra });

// Resolve every basket line from server-owned catalogue data. Both voucher
// preview and final checkout use this function, so a browser can never invent
// a product, a price or an eligible discount line.
const resolveOrderLines = async (store, items) => {
  const lines = [];
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
    const price = money(
      effectiveItemPrice(listing, selectedProduct, selectedVariant),
    );
    if (!Number.isFinite(price) || price <= 0) {
      throw requestError(
        409,
        `${lineName} is visible but its price still needs to be confirmed`,
        {
          product: lineName,
        },
      );
    }
    lines.push({
      listing,
      product: selectedProduct,
      name: lineName,
      brand: listing.brand,
      price,
      quantity: qty,
      subtotal: money(price * qty),
      discount: 0,
      lineTotal: money(price * qty),
    });
  }
  return lines;
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
    const { name, description = "", image = "", sortWeight = 0 } = req.body;
    if (!name?.trim())
      return res.status(400).json({ message: "Category name is required" });

    const slug = slugify(req.body.slug || name);
    const exists = await OnlineCategory.findOne({ store, slug });
    if (exists)
      return res
        .status(400)
        .json({ message: "A category with this slug already exists" });

    const category = await OnlineCategory.create({
      store,
      name: name.trim(),
      slug,
      description,
      image,
      sortWeight,
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

module.exports.updateCategory = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid category id" });
    const store = await storeId();
    const updates = { ...req.body };
    if (updates.slug || updates.name)
      updates.slug = slugify(updates.slug || updates.name);
    delete updates.store;

    const category = await OnlineCategory.findOneAndUpdate(
      { _id: req.params.id, store },
      updates,
      { new: true },
    );
    if (!category)
      return res.status(404).json({ message: "Category not found" });
    return res.status(200).json({ message: "Category updated", category });
  } catch (error) {
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
      specs:
        req.body.specs && typeof req.body.specs === "object"
          ? req.body.specs
          : {},
      flavour: req.body.flavour ?? "",
      optionLabel: req.body.optionLabel ?? "",
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

    const textFields = [
      "webName",
      "brand",
      "shortDescription",
      "description",
      "flavour",
      "optionLabel",
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

    if (Object.prototype.hasOwnProperty.call(req.body, "tags")) {
      const allowedTags = new Set(["new", "bestseller", "sale", "limited"]);
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
    const social = req.body.social || {};
    for (const platform of Object.keys(SOCIAL_HOSTS)) {
      if (Object.prototype.hasOwnProperty.call(social, platform)) {
        settings.social[platform] = socialUrl(platform, social[platform]);
      }
    }
    const footer = req.body.footer || {};
    for (const key of [
      "description",
      "supportEmail",
      "supportPhone",
      "address",
    ]) {
      if (Object.prototype.hasOwnProperty.call(footer, key)) {
        settings.footer[key] = String(footer[key] || "").trim();
      }
    }
    const announcement = req.body.announcement || {};
    for (const key of ["primary", "secondary"]) {
      if (Object.prototype.hasOwnProperty.call(announcement, key)) {
        settings.announcement[key] = String(announcement[key] || "").trim();
      }
    }
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
    const business = req.body.business || {};
    for (const key of ["legalName", "tradingName", "companyNumber", "vatNumber"]) {
      if (Object.prototype.hasOwnProperty.call(business, key)) {
        settings.business[key] = String(business[key] || "")
          .trim()
          .slice(0, 200);
      }
    }
    const policies = req.body.policies || {};
    for (const key of [
      "terms",
      "privacy",
      "shippingReturns",
      "refunds",
      "cookies",
    ]) {
      if (Object.prototype.hasOwnProperty.call(policies, key)) {
        settings.policies[key] = String(policies[key] || "")
          .trim()
          .slice(0, 20000);
      }
    }
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
      .sort({ sortWeight: 1, createdAt: 1 })
      .lean();
    return res.status(200).json({ slides });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load hero slides", error: error.message });
  }
};

module.exports.createHeroSlide = async (req, res) => {
  try {
    const store = await storeId();
    if (!req.body.titleTop?.trim())
      return res.status(400).json({ message: "The slide needs a headline" });
    const payload = { ...req.body, store };
    if (!payload.listing) {
      return res
        .status(400)
        .json({ message: "Choose the product this hero slide should open" });
    }
    if (payload.listing) {
      if (!mongoose.isValidObjectId(payload.listing)) {
        return res
          .status(400)
          .json({ message: "Choose a valid online product" });
      }
      const listing = await OnlineListing.findOne({
        _id: payload.listing,
        store,
      }).populate("product", "name image");
      if (!listing)
        return res
          .status(400)
          .json({ message: "That product is not in this store" });
      if (!payload.image)
        payload.image =
          listing.gallery?.[0]?.url || listing.product?.image?.url || "";
      if (!payload.imageAlt)
        payload.imageAlt = listing.webName || listing.product?.name || "";
    } else {
      payload.listing = null;
    }
    const slide = await OnlineHeroSlide.create(payload);
    emit(req, "onlineHeroChanged", {});
    return res.status(201).json({ message: "Slide created", slide });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not create slide", error: error.message });
  }
};

module.exports.updateHeroSlide = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid slide id" });
    const store = await storeId();
    const updates = { ...req.body };
    delete updates.store;
    if (Object.prototype.hasOwnProperty.call(updates, "listing")) {
      if (updates.listing) {
        if (!mongoose.isValidObjectId(updates.listing)) {
          return res
            .status(400)
            .json({ message: "Choose a valid online product" });
        }
        const listing = await OnlineListing.findOne({
          _id: updates.listing,
          store,
        }).populate("product", "name image");
        if (!listing)
          return res
            .status(400)
            .json({ message: "That product is not in this store" });
        if (!updates.image)
          updates.image =
            listing.gallery?.[0]?.url || listing.product?.image?.url || "";
        if (!updates.imageAlt)
          updates.imageAlt = listing.webName || listing.product?.name || "";
      } else {
        return res
          .status(400)
          .json({ message: "Choose the product this hero slide should open" });
      }
    }
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
      .status(500)
      .json({ message: "Could not update slide", error: error.message });
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
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    return res.status(200).json({
      orders,
      pending: await OnlineOrder.countDocuments({
        store,
        status: { $in: ["pending_payment", "paid", "processing"] },
      }),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load orders", error: error.message });
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

      const transitions = {
        pending_payment: ["paid", "cancelled"],
        paid: ["processing", "cancelled", "refunded"],
        processing: ["shipped", "cancelled", "refunded"],
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
            totalAmount: money(
              item.lineTotal +
                (index === 0 ? Number(order.shipping || 0) : 0) +
                (index === 0 ? Number(order.tax || 0) : 0),
            ),
            discount: item.discount,
            tax: index === 0 ? Number(order.tax || 0) : 0,
            paymentStatus: "paid",
            paymentMethod: isCashOnDelivery ? "cash" : "wallet",
            status: "completed",
            source: "online",
          })),
          { session },
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
            totalAmount: -money(
              item.lineTotal +
                (index === 0 ? Number(order.shipping || 0) : 0) +
                (index === 0 ? Number(order.tax || 0) : 0),
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
          { session },
        );
        order.payment.status = "refunded";
        order.refundRecordedAt = new Date();
      }

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
    return res.status(200).json({ message: `Order marked ${status}`, order });
  } catch (error) {
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
      status: { $in: ["paid", "processing", "shipped", "delivered"] },
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

module.exports.storefrontCategories = async (req, res) => {
  try {
    const store = await storeId();
    const cats = await OnlineCategory.find({ store, active: true })
      .sort({ sortWeight: 1, name: 1 })
      .lean();
    return res.status(200).json({
      categories: cats.map((c) => ({
        id: String(c._id),
        slug: c.slug,
        name: c.name,
        description: c.description,
        image: c.image,
        sortWeight: c.sortWeight,
      })),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load categories", error: error.message });
  }
};

module.exports.storefrontSettings = async (req, res) => {
  try {
    const store = await storeId();
    const settings = await getOrCreateSettings(store);
    return res.status(200).json({
      settings: {
        social: settings.social,
        footer: settings.footer,
        announcement: settings.announcement,
        newThisWeek: settings.newThisWeek,
        deals: settings.deals,
        business: settings.business,
        policies: settings.policies,
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not load store settings", error: error.message });
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

module.exports.storefrontProducts = async (req, res) => {
  try {
    const store = await storeId();
    const filter = { store, listed: true };
    if (req.query.category) {
      const cat = await OnlineCategory.findOne({
        store,
        slug: String(req.query.category),
      })
        .select("_id")
        .lean();
      if (cat) filter.$or = [{ category: cat._id }, { categories: cat._id }];
    }
    const listings = await OnlineListing.find(filter)
      .populate("product", "name Price quantity image")
      .populate("variants.product", "name Price quantity image")
      .populate("category", "name slug")
      .populate("categories", "name slug")
      .sort({ sortWeight: 1, createdAt: -1 })
      .lean();
    return res
      .status(200)
      .json({ products: listings.map(publicListing).filter(Boolean) });
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
      .populate("category", "name slug")
      .populate("categories", "name slug")
      .lean();
    if (!listing) return res.status(404).json({ message: "Product not found" });
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
      .sort({ sortWeight: 1, createdAt: 1 })
      .lean();

    return res.status(200).json({
      slides: slides.map((s) => {
        const productSlug = String(s.listing?.slug || "");
        return {
          id: String(s._id),
          eyebrow: s.eyebrow,
          titleTop: s.titleTop,
          titleItalic: s.titleItalic,
          titleBadge: s.titleBadge,
          titleBottom: s.titleBottom,
          copy: s.copy,
          ctaPrimary: {
            label: String(s.ctaPrimary?.label || "").trim() || "Shop this product",
            to: productSlug ? "/product/$id" : "/shop",
            params: productSlug ? { id: productSlug } : {},
          },
          ctaSecondary: {
            label: String(s.ctaSecondary?.label || "").trim() || "Browse all",
            to: "/shop",
            params: {},
          },
          image: s.image,
          imageAlt: s.imageAlt,
          burst: s.burst,
          tone: s.tone,
          product: s.listing?.product
            ? {
                slug: productSlug,
                name: s.listing.webName || s.listing.product.name,
                brand: s.listing.brand,
                price: money(effectiveItemPrice(s.listing, s.listing.product)),
                was: saleIsActive(s.listing)
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
      const orderNo = `WEB-${await nextSequence("onlineOrder")}`;

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

const customerConfirmationBody = (order, brand, supportEmail) => `
  <p style="margin:0 0 8px;">Hi ${esc(order.customer?.name || "there")},</p>
  <p style="margin:0 0 16px;">Thank you for your order with ${esc(brand?.name || "us")} — we've received it and it's now being prepared.</p>
  <p style="margin:0 0 16px;font-size:16px;"><strong>Order ${esc(order.orderNo)}</strong></p>
  ${orderItemsTable(order)}
  ${shippingAddressBlock(order)}
  <div style="margin-top:16px;padding:12px 16px;background:#f9fafb;border-radius:8px;font-size:14px;">
    <strong>Payment — cash on delivery.</strong> Please have €${money(order.total)} ready when your order arrives.
  </div>
  <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">
    Questions about your order?${supportEmail ? ` Contact us at <a href="mailto:${esc(supportEmail)}">${esc(supportEmail)}</a> and quote ${esc(order.orderNo)}.` : ` Just quote your order number ${esc(order.orderNo)}.`}
  </p>`;

const shopAlertBody = (order) => `
  <p style="margin:0 0 16px;">A new online order has been placed.</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:12px;">
    <tr><td style="padding:4px 0;color:#6b7280;width:110px;">Order</td><td style="padding:4px 0;font-weight:bold;">${esc(order.orderNo)}</td></tr>
    <tr><td style="padding:4px 0;color:#6b7280;">Customer</td><td style="padding:4px 0;">${esc(order.customer?.name || "")}</td></tr>
    <tr><td style="padding:4px 0;color:#6b7280;">Email</td><td style="padding:4px 0;">${esc(order.customer?.email || "")}</td></tr>
    <tr><td style="padding:4px 0;color:#6b7280;">Phone</td><td style="padding:4px 0;">${esc(order.customer?.phone || "—")}</td></tr>
    <tr><td style="padding:4px 0;color:#6b7280;">Payment</td><td style="padding:4px 0;">Cash on delivery</td></tr>
  </table>
  ${orderItemsTable(order)}
  ${shippingAddressBlock(order)}`;

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
        "Online Store",
      addressLines: settings?.footer?.address ? [settings.footer.address] : [],
      phone: settings?.footer?.supportPhone || "",
    };

    if (order.customer?.email) {
      await sendMail({
        to: order.customer.email,
        subject: `Your ${brand.name} order ${order.orderNo} is confirmed`,
        html: brandedHtml(brand, customerConfirmationBody(order, brand, supportEmail)),
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

// Voucher-aware checkout. This supersedes the original implementation above
// while preserving its guarded, shared-inventory decrement behavior.
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
    } = req.body;

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
        message: "Cash on delivery is the available payment method",
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

    const discount = money(voucherResult?.discount || 0);
    const tax = 0;
    const merchandiseTotal = money(subtotal - discount);
    const shipping =
      merchandiseTotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT;
    const total = money(merchandiseTotal + shipping);

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
      await Promise.all(
        taken.map((item) =>
          Product.updateOne(
            { _id: item.product },
            { $inc: { quantity: item.quantity } },
          ),
        ),
      );
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
        await Promise.all(
          taken.map((item) =>
            Product.updateOne(
              { _id: item.product },
              { $inc: { quantity: item.quantity } },
            ),
          ),
        );
        throw requestError(409, "This voucher is no longer available");
      }
      voucherReserved = true;
    }

    let order;
    try {
      const orderNo = `WEB-${await nextSequence("onlineOrder")}`;
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
        },
        shippingAddress,
        subtotal,
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
        payment: {
          provider: "cod",
          method: "cash_on_delivery",
          reference: "",
          status: "unpaid",
        },
        // COD is confirmed immediately for fulfilment. Revenue is posted to
        // the shared Sale ledger only when the order is marked delivered.
        status: "processing",
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
