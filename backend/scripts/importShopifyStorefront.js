/* eslint-disable no-console */
require("dotenv").config();

const crypto = require("crypto");
const mongoose = require("mongoose");
const Category = require("../models/ Categorymodel");
const OnlineCategory = require("../models/OnlineCategorymodel");
const OnlineHeroSlide = require("../models/OnlineHeroSlidemodel");
const OnlineListing = require("../models/OnlineListingmodel");
const Product = require("../models/Productmodel");
const Store = require("../models/Storemodel");

const APPLY = process.argv.includes("--apply");
const PROVIDER = "shopify";
const STORE_DOMAIN = "candycloud-vape.myshopify.com";
const BASE_URL = `https://${STORE_DOMAIN}`;
const IMPORTER_VERSION = "shopify-storefront-v1";
const STOCK_PER_SELLABLE_OPTION = 1;
const GALLERY_LIMIT = 8;

const money = (value) => Math.round(Number(value || 0) * 100) / 100;
const text = (value) => String(value ?? "").trim();
const slugify = (value) =>
  text(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const normalizedName = (value) =>
  text(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const sourceKey = ({ productId, variantId = "", role = "parent" }) =>
  `${PROVIDER}|${STORE_DOMAIN}|${productId}|${variantId}|${role}`;
const median = (values) => {
  const ordered = [...values].sort((a, b) => a - b);
  if (!ordered.length) return 0;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : money((ordered[middle - 1] + ordered[middle]) / 2);
};
const normalizeImageUrl = (value) => {
  const url = text(value);
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("http://")) return `https://${url.slice(7)}`;
  return url;
};
const decodeEntities = (value) =>
  text(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16))
    );
const plainText = (html) =>
  decodeEntities(
    text(html)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|li|div|h[1-6])>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
const hash = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "E360-Catalog-Importer/1.0" },
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
};

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: { accept: "text/html", "user-agent": "E360-Catalog-Importer/1.0" },
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
};

const fetchPagedProducts = async (path) => {
  const products = [];
  for (let page = 1; ; page += 1) {
    const joiner = path.includes("?") ? "&" : "?";
    const payload = await fetchJson(`${BASE_URL}${path}${joiner}limit=250&page=${page}`);
    const batch = Array.isArray(payload.products) ? payload.products : [];
    products.push(...batch);
    if (batch.length < 250) break;
  }
  return products;
};

const menuLinksFromHtml = (html) => {
  const block =
    html.match(
      /<overflow-list[\s\S]*?data-testid="header-menu-overflow-list"[\s\S]*?<\/overflow-list>/i
    )?.[0] || "";
  const links = [];
  const regex =
    /<a[^>]+href="\/collections\/([^"]+)"[^>]*>[\s\S]*?<span[^>]*class="menu-list__link-title"[^>]*>([\s\S]*?)<\/span>[\s\S]*?<\/a>/gi;
  let match;
  while ((match = regex.exec(block))) {
    const handle = text(match[1]);
    if (!links.some((link) => link.handle === handle)) {
      links.push({ handle, name: plainText(match[2]) });
    }
  }
  if (!links.length) {
    throw new Error("The Shopify navigation menu could not be read");
  }
  return links;
};

const BRAND_RULES = [
  ["lost mary", "Lost Mary"],
  ["nordic spirit", "Nordic Spirit"],
  ["nodric spirit", "Nordic Spirit"],
  ["the butender", "The Butender"],
  ["the budtender", "The Budtender"],
  ["ivg", "IVG"],
  ["elfliq", "ElfLiq"],
  ["elfbar", "Elf Bar"],
  ["vaporesso", "Vaporesso"],
  ["vaporreso", "Vaporesso"],
  ["voopoo", "Voopoo"],
  ["hayati", "Hayati"],
  ["aspire", "Aspire"],
  ["cuba", "Cuba"],
  ["pixl", "PIXL"],
  ["rizla", "Rizla"],
  ["crushball", "Crushball"],
  ["raw", "RAW"],
  ["aztec", "Aztec"],
  ["hhz", "HHZ"],
  ["rollz", "Rollz"],
  ["loom", "Loom"],
  ["goat", "GOAT"],
  ["rascal", "Rascal"],
  ["zaza", "Zaza"],
  ["haze", "Haze"],
  ["acan", "ACAN"],
  ["velo", "VELO"],
  ["elux", "ELUX"],
  ["boom pro", "Boom Pro"],
];
const inferBrand = (title) => {
  const normalized = normalizedName(title);
  return BRAND_RULES.find(([needle]) => normalized.startsWith(needle))?.[1] || "";
};

const inferCollection = (title) => {
  const value = normalizedName(title);
  if (/nicotine pouch|dry pouch|\bpouch\b/.test(value)) return "nicotine-pouches";
  if (/vaporesso|vaporreso/.test(value)) return "vaporesso-series";
  if (/cbd|gumm|edible|acan|haze sleep/.test(value)) return "cbd-edible-collection";
  if (/rizla|rolling|filter|cone|raw black|raw classic/.test(value)) return "rolling-paper";
  if (/nic salt|eliq|e liquid/.test(value)) return "nic-salt-eliq";
  if (/lost mary/.test(value)) return "lost-mary-collection";
  if (/\bivg\b/.test(value)) return "ivg-vape-range";
  if (/disposable|hayati|elfbar|pixl/.test(value)) return "disposable-vapes";
  return "vapes-pods";
};

const variantAliasNames = (productTitle, variantTitle) => {
  const prefix = text(productTitle).split("|")[0].trim();
  return [
    `${productTitle} — ${variantTitle}`,
    `${productTitle} - ${variantTitle}`,
    `${prefix} ${variantTitle}`,
  ]
    .map(normalizedName)
    .filter(Boolean);
};

const imageForVariant = (product, variant) => {
  const image = (product.images || []).find(
    (candidate) => String(candidate.id) === String(variant.image_id || "")
  );
  return normalizeImageUrl(image?.src || "");
};

const correctedVariantPrices = (product) => {
  const raw = (product.variants || []).map((variant) => Number(variant.price || 0));
  const plausible = raw.filter((price) => price > 0 && price < 1000);
  const typical = median(plausible);
  return raw.map((price) => {
    if (price === 0 && typical > 0) {
      return { raw, price: typical, reason: "zero replaced with product median" };
    }
    if (typical > 0 && price >= typical * 20 && price / 100 <= typical * 2) {
      return {
        raw,
        price: typical,
        reason: "outlier replaced with product median",
      };
    }
    return { raw, price: money(price), reason: "" };
  });
};

const buildSource = async () => {
  const [homeHtml, products, collectionPayload] = await Promise.all([
    fetchText(BASE_URL),
    fetchPagedProducts("/products.json"),
    fetchJson(`${BASE_URL}/collections.json?limit=250`),
  ]);
  const menu = menuLinksFromHtml(homeHtml);
  const collectionsByHandle = new Map(
    (collectionPayload.collections || []).map((collection) => [
      collection.handle,
      collection,
    ])
  );
  const menuCollections = [];
  const memberships = new Map();

  for (const [index, link] of menu.entries()) {
    const collection = collectionsByHandle.get(link.handle);
    if (!collection) {
      throw new Error(`Menu collection "${link.handle}" is missing from Shopify`);
    }
    const collectionProducts = await fetchPagedProducts(
      `/collections/${encodeURIComponent(link.handle)}/products.json`
    );
    menuCollections.push({
      ...collection,
      title: link.name || collection.title,
      menuIndex: index,
      productIds: collectionProducts.map((product) => String(product.id)),
    });
    for (const product of collectionProducts) {
      const id = String(product.id);
      if (!memberships.has(id)) memberships.set(id, []);
      memberships.get(id).push(link.handle);
    }
  }

  const frontpageProducts = await fetchPagedProducts(
    "/collections/frontpage/products.json"
  ).catch(() => []);
  return {
    menuCollections,
    memberships,
    featuredIds: new Set(frontpageProducts.map((product) => String(product.id))),
    products,
  };
};

const main = async () => {
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not configured");

  const source = await buildSource();
  const canonicalSource = JSON.stringify({
    importer: IMPORTER_VERSION,
    menuCollections: source.menuCollections,
    products: source.products,
  });
  const sourceHash = hash(canonicalSource);
  const runId = `shopify-store-${sourceHash.slice(0, 12)}`;

  await mongoose.connect(process.env.MONGODB_URL);
  const runs = mongoose.connection.db.collection("shopifyStoreImportRuns");
  const backups = mongoose.connection.db.collection("shopifyStoreImportBackups");
  await runs.createIndex({ sourceHash: 1 }, { unique: true });

  const completed = await runs.findOne({ sourceHash, status: "completed" });
  if (completed) {
    console.log(`Already applied as ${completed.runId}; no changes made.`);
    return;
  }

  const store = await Store.findOne({ key: "shop" }).lean();
  if (!store) throw new Error("Store is not configured");
  if (store.currency !== "EUR") {
    throw new Error(`Store currency is ${store.currency}; Shopify import requires EUR`);
  }

  const [
    inventory,
    inventoryCategories,
    onlineCategories,
    onlineListings,
    heroSlides,
  ] = await Promise.all([
    Product.find({})
      .select("name Price costPrice quantity Category image barcode onlineSource")
      .lean(),
    Category.find({}).lean(),
    OnlineCategory.find({ store: store._id }).lean(),
    OnlineListing.find({ store: store._id }).lean(),
    OnlineHeroSlide.find({ store: store._id, active: true }).lean(),
  ]);

  const inventoryByName = new Map();
  const inventoryBySource = new Map();
  for (const product of inventory) {
    const nameKey = normalizedName(product.name);
    if (!inventoryByName.has(nameKey)) inventoryByName.set(nameKey, []);
    inventoryByName.get(nameKey).push(product);
    if (
      product.onlineSource?.provider === PROVIDER &&
      product.onlineSource?.storeDomain === STORE_DOMAIN
    ) {
      inventoryBySource.set(
        sourceKey({
          productId: product.onlineSource.productId,
          variantId: product.onlineSource.variantId,
          role: product.onlineSource.role,
        }),
        product
      );
    }
  }

  const categoryByName = new Map(
    inventoryCategories.map((category) => [normalizedName(category.name), category])
  );
  const onlineCategoryBySlug = new Map(
    onlineCategories.map((category) => [category.slug, category])
  );
  const listingByProduct = new Map(
    onlineListings.map((listing) => [String(listing.product), listing])
  );
  const listingBySource = new Map(
    onlineListings
      .filter(
        (listing) =>
          listing.source?.provider === PROVIDER &&
          listing.source?.storeDomain === STORE_DOMAIN &&
          listing.source?.externalId
      )
      .map((listing) => [String(listing.source.externalId), listing])
  );

  const inventoryCategoryPlans = new Map();
  const onlineCategoryPlans = new Map();
  for (const collection of source.menuCollections) {
    const normalized = normalizedName(collection.title);
    const existingInventoryCategory = categoryByName.get(normalized);
    const inventoryId =
      existingInventoryCategory?._id || new mongoose.Types.ObjectId();
    inventoryCategoryPlans.set(collection.handle, {
      id: inventoryId,
      existing: existingInventoryCategory || null,
      name: collection.title,
      description: plainText(collection.body_html),
    });

    const existingOnlineCategory = onlineCategoryBySlug.get(collection.handle);
    const onlineId = existingOnlineCategory?._id || new mongoose.Types.ObjectId();
    const firstProduct = source.products.find((product) =>
      collection.productIds.includes(String(product.id))
    );
    onlineCategoryPlans.set(collection.handle, {
      id: onlineId,
      existing: existingOnlineCategory || null,
      name: collection.title,
      slug: collection.handle,
      description: plainText(collection.body_html),
      image: normalizeImageUrl(
        collection.image?.src || firstProduct?.images?.[0]?.src || ""
      ),
      sortWeight: collection.menuIndex,
      externalId: String(collection.id),
    });
  }

  const usedInventoryIds = new Set();
  const findUnusedByNames = (names) => {
    const candidates = [];
    for (const name of names) {
      for (const candidate of inventoryByName.get(name) || []) {
        if (
          !usedInventoryIds.has(String(candidate._id)) &&
          !candidates.some((item) => String(item._id) === String(candidate._id))
        ) {
          candidates.push(candidate);
        }
      }
    }
    return candidates.length === 1 ? candidates[0] : null;
  };

  const productPlans = [];
  const corrections = [];
  const unresolvedPrices = [];

  for (const [productIndex, sourceProduct] of source.products.entries()) {
    const productId = String(sourceProduct.id);
    let handles = source.memberships.get(productId) || [];
    let inferredCollection = false;
    if (!handles.length) {
      handles = [inferCollection(sourceProduct.title)];
      inferredCollection = true;
    }
    handles = handles.filter((handle) => onlineCategoryPlans.has(handle));
    if (!handles.length) handles = ["vapes-pods"];

    const parentSourceKey = sourceKey({ productId, role: "parent" });
    let parent = inventoryBySource.get(parentSourceKey) || null;
    if (!parent) {
      parent = findUnusedByNames([normalizedName(sourceProduct.title)]);
    }
    if (parent) usedInventoryIds.add(String(parent._id));

    const rawPricePlans = correctedVariantPrices(sourceProduct);
    const variants = [];
    for (const [variantIndex, sourceVariant] of sourceProduct.variants.entries()) {
      const variantId = String(sourceVariant.id);
      let matched = null;
      if (sourceProduct.variants.length > 1) {
        matched =
          inventoryBySource.get(
            sourceKey({ productId, variantId, role: "variant" })
          ) ||
          findUnusedByNames(
            variantAliasNames(sourceProduct.title, sourceVariant.title)
          );
        if (matched) usedInventoryIds.add(String(matched._id));
      }

      const corrected = rawPricePlans[variantIndex];
      let resolvedPrice = corrected.price;
      let correctionReason = corrected.reason;
      if (resolvedPrice <= 0 && matched && Number(matched.Price) > 0) {
        resolvedPrice = money(matched.Price);
        correctionReason = "zero replaced with existing E360 price";
      }
      if (correctionReason) {
        corrections.push({
          product: sourceProduct.title,
          variant: sourceVariant.title,
          from: Number(sourceVariant.price || 0),
          to: resolvedPrice,
          reason: correctionReason,
        });
      }
      if (resolvedPrice <= 0) {
        unresolvedPrices.push({
          product: sourceProduct.title,
          variant: sourceVariant.title,
        });
      }

      variants.push({
        source: sourceVariant,
        id:
          sourceProduct.variants.length > 1
            ? matched?._id || new mongoose.Types.ObjectId()
            : null,
        matched,
        price: resolvedPrice,
        image: imageForVariant(sourceProduct, sourceVariant),
      });
    }

    const positivePrices = variants
      .map((variant) => variant.price)
      .filter((price) => price > 0);
    const parentPrice = positivePrices.length
      ? Math.min(...positivePrices)
      : variants[0]?.price || 0;
    const parentId = parent?._id || new mongoose.Types.ObjectId();
    const listing =
      listingBySource.get(productId) ||
      listingByProduct.get(String(parentId)) ||
      null;

    productPlans.push({
      source: sourceProduct,
      productIndex,
      handles,
      inferredCollection,
      parent: {
        id: parentId,
        matched: parent,
        price: parentPrice,
      },
      variants,
      listing: {
        id: listing?._id || new mongoose.Types.ObjectId(),
        existing: listing,
      },
    });
  }

  const summary = {
    sourceProducts: productPlans.length,
    sourceVariants: productPlans.reduce(
      (sum, product) => sum + product.variants.length,
      0
    ),
    menuCategories: source.menuCollections.length,
    inferredCategoryProducts: productPlans.filter(
      (product) => product.inferredCollection
    ).length,
    inventoryParentsMatched: productPlans.filter(
      (product) => product.parent.matched
    ).length,
    inventoryParentsCreated: productPlans.filter(
      (product) => !product.parent.matched
    ).length,
    inventoryVariantsMatched: productPlans.reduce(
      (sum, product) =>
        sum + product.variants.filter((variant) => variant.matched).length,
      0
    ),
    inventoryVariantsCreated: productPlans.reduce(
      (sum, product) =>
        sum +
        (product.variants.length > 1
          ? product.variants.filter((variant) => !variant.matched).length
          : 0),
      0
    ),
    inventoryCategoriesCreated: [...inventoryCategoryPlans.values()].filter(
      (category) => !category.existing
    ).length,
    onlineCategoriesCreated: [...onlineCategoryPlans.values()].filter(
      (category) => !category.existing
    ).length,
    existingListingsReused: productPlans.filter(
      (product) => product.listing.existing
    ).length,
    listingsCreated: productPlans.filter(
      (product) => !product.listing.existing
    ).length,
    priceCorrections: corrections.length,
    unresolvedPrices: unresolvedPrices.length,
    stockPerSelectableOption: STOCK_PER_SELLABLE_OPTION,
  };

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} ${runId}`);
  console.log(JSON.stringify(summary, null, 2));
  if (corrections.length) {
    console.log("\nPrice corrections:");
    for (const correction of corrections) console.log(JSON.stringify(correction));
  }
  if (unresolvedPrices.length) {
    console.log("\nProducts visible but checkout-blocked until a price is confirmed:");
    for (const item of unresolvedPrices) console.log(JSON.stringify(item));
  }
  console.log("\nMenu:");
  for (const collection of source.menuCollections) {
    console.log(
      `${collection.menuIndex + 1}. ${collection.title} (${collection.productIds.length} source products)`
    );
  }
  console.log("\nProducts:");
  for (const plan of productPlans) {
    console.log(
      JSON.stringify({
        title: plan.source.title,
        handle: plan.source.handle,
        categories: plan.handles,
        categoryInferred: plan.inferredCollection,
        variants: plan.variants.length,
        parent: plan.parent.matched
          ? `match:${plan.parent.matched.name}`
          : "create",
        matchedVariants: plan.variants.filter((variant) => variant.matched).length,
        images: plan.source.images?.length || 0,
        price: plan.parent.price,
      })
    );
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply after reviewing this plan.");
    return;
  }

  await runs.updateOne(
    { sourceHash },
    {
      $setOnInsert: {
        runId,
        sourceHash,
        importerVersion: IMPORTER_VERSION,
        sourceUrl: BASE_URL,
        createdAt: new Date(),
      },
      $set: { status: "applying", summary, updatedAt: new Date() },
    },
    { upsert: true }
  );

  const backupEntries = [];
  const backedUp = new Set();
  const addBackup = (collection, document, operation = "update") => {
    if (!document) return;
    const key = `${collection}:${document._id}`;
    if (backedUp.has(key)) return;
    backedUp.add(key);
    backupEntries.push({
      runId,
      collection,
      operation,
      documentId: document._id,
      before: operation === "create" ? null : document,
      createdAt: new Date(),
    });
  };

  for (const category of onlineCategories.filter((category) => category.active)) {
    addBackup("onlinecategories", category);
  }
  for (const listing of onlineListings.filter((listing) => listing.listed)) {
    addBackup("onlinelistings", listing);
  }
  for (const category of inventoryCategoryPlans.values()) {
    if (category.existing) addBackup("categories", category.existing);
  }
  for (const category of onlineCategoryPlans.values()) {
    if (category.existing) addBackup("onlinecategories", category.existing);
  }
  for (const plan of productPlans) {
    if (plan.parent.matched) addBackup("products", plan.parent.matched);
    for (const variant of plan.variants) {
      if (variant.matched) addBackup("products", variant.matched);
    }
    if (plan.listing.existing) {
      addBackup("onlinelistings", plan.listing.existing);
    }
  }
  const targetListingIds = new Set(
    productPlans.map((plan) => String(plan.listing.id))
  );
  for (const slide of heroSlides) {
    if (!targetListingIds.has(String(slide.listing || ""))) {
      addBackup("onlineheroslides", slide);
    }
  }

  const categoryOperations = [];
  for (const category of inventoryCategoryPlans.values()) {
    if (category.existing) continue;
    categoryOperations.push({
      insertOne: {
        document: {
          _id: category.id,
          name: category.name,
          description: category.description,
          system: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    });
    addBackup("categories", { _id: category.id }, "create");
  }

  const onlineCategoryOperations = [
    {
      updateMany: {
        filter: { store: store._id, active: true },
        update: { $set: { active: false, updatedAt: new Date() } },
      },
    },
  ];
  for (const category of onlineCategoryPlans.values()) {
    onlineCategoryOperations.push({
      updateOne: {
        filter: { _id: category.id },
        update: {
          $set: {
            store: store._id,
            name: category.name,
            slug: category.slug,
            description: category.description,
            image: category.image,
            sortWeight: category.sortWeight,
            active: true,
            source: {
              provider: PROVIDER,
              storeDomain: STORE_DOMAIN,
              externalId: category.externalId,
              handle: category.slug,
            },
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        upsert: true,
      },
    });
    if (!category.existing) {
      addBackup("onlinecategories", { _id: category.id }, "create");
    }
  }

  const productOperations = [];
  const listingOperations = [
    {
      updateMany: {
        filter: { store: store._id, listed: true },
        update: { $set: { listed: false, updatedAt: new Date() } },
      },
    },
  ];
  const heroOperations = [];

  for (const plan of productPlans) {
    const product = plan.source;
    const primaryCategory = inventoryCategoryPlans.get(plan.handles[0]);
    const onlineCategoryIds = plan.handles.map(
      (handle) => onlineCategoryPlans.get(handle).id
    );
    const description = plainText(product.body_html);
    const gallery = (product.images || [])
      .map((image) => ({
        url: normalizeImageUrl(image.src),
        publicId: "",
        alt: text(image.alt) || product.title,
      }))
      .filter((image) => image.url)
      .filter(
        (image, index, images) =>
          images.findIndex((candidate) => candidate.url === image.url) === index
      )
      .slice(0, GALLERY_LIMIT);
    const firstImage = gallery[0] || null;

    const parentSet = {
      name: product.title,
      Desciption: description,
      Category: primaryCategory.id,
      Price: plan.parent.price,
      quantity: STOCK_PER_SELLABLE_OPTION,
      image: firstImage
        ? { url: firstImage.url, publicId: firstImage.publicId }
        : {},
      onlineSource: {
        provider: PROVIDER,
        storeDomain: STORE_DOMAIN,
        productId: String(product.id),
        variantId: "",
        role: "parent",
      },
      updatedAt: new Date(),
    };
    if (plan.parent.matched) {
      productOperations.push({
        updateOne: {
          filter: { _id: plan.parent.id },
          update: { $set: parentSet },
        },
      });
    } else {
      productOperations.push({
        insertOne: {
          document: {
            _id: plan.parent.id,
            ...parentSet,
            costPrice: 0,
            lowStockThreshold: 10,
            createdAt: new Date(),
          },
        },
      });
      addBackup("products", { _id: plan.parent.id }, "create");
    }

    const listingVariants = [];
    if (plan.variants.length > 1) {
      for (const variant of plan.variants) {
        const variantName = `${product.title} — ${variant.source.title}`;
        const variantSet = {
          name: variantName,
          Desciption: description
            ? `${description}\nOption: ${variant.source.title}.`
            : `Option: ${variant.source.title}.`,
          Category: primaryCategory.id,
          Price: variant.price,
          quantity: STOCK_PER_SELLABLE_OPTION,
          image: variant.image
            ? { url: variant.image, publicId: "" }
            : firstImage
              ? { url: firstImage.url, publicId: "" }
              : {},
          onlineSource: {
            provider: PROVIDER,
            storeDomain: STORE_DOMAIN,
            productId: String(product.id),
            variantId: String(variant.source.id),
            role: "variant",
          },
          updatedAt: new Date(),
        };
        if (variant.matched) {
          productOperations.push({
            updateOne: {
              filter: { _id: variant.id },
              update: { $set: variantSet },
            },
          });
        } else {
          productOperations.push({
            insertOne: {
              document: {
                _id: variant.id,
                ...variantSet,
                costPrice: 0,
                lowStockThreshold: 10,
                createdAt: new Date(),
              },
            },
          });
          addBackup("products", { _id: variant.id }, "create");
        }
        listingVariants.push({
          product: variant.id,
          label: variant.source.title,
          priceOverride: variant.price > 0 ? variant.price : null,
          image: variant.image,
          externalId: String(variant.source.id),
        });
      }
    }

    const comparePrices = (product.variants || [])
      .map((variant) => Number(variant.compare_at_price || 0))
      .filter((price) => price > plan.parent.price);
    const compareAtPrice = comparePrices.length
      ? Math.min(...comparePrices)
      : null;
    const shortDescription =
      description.length > 180
        ? `${description.slice(0, 177).trim()}...`
        : description;
    const tags = compareAtPrice ? ["sale"] : [];

    listingOperations.push({
      updateOne: {
        filter: { _id: plan.listing.id },
        update: {
          $set: {
            store: store._id,
            product: plan.parent.id,
            category: onlineCategoryIds[0],
            categories: onlineCategoryIds,
            variants: listingVariants,
            listed: true,
            slug: product.handle,
            webName: product.title,
            brand: inferBrand(product.title),
            shortDescription,
            description,
            gallery,
            specs: {
              Brand: inferBrand(product.title) || "Candy Cloud Vape",
              Options: (product.options || [])
                .map((option) => option.name)
                .filter(Boolean)
                .join(", "),
            },
            flavour: listingVariants.length ? "Multiple options" : "",
            optionLabel: (product.options || [])
              .map((option) => option.name)
              .filter(Boolean)
              .join(" / "),
            tags,
            // Keep unresolved source prices linked to the inventory price.
            // Once the owner confirms the Product price in E360, the website
            // becomes purchasable automatically without another import.
            priceOverride: plan.parent.price > 0 ? plan.parent.price : null,
            compareAtPrice,
            seo: {
              title: product.title,
              description: shortDescription.slice(0, 155),
            },
            featured: source.featuredIds.has(String(product.id)),
            sortWeight: plan.productIndex,
            source: {
              provider: PROVIDER,
              storeDomain: STORE_DOMAIN,
              externalId: String(product.id),
              handle: product.handle,
              url: `${BASE_URL}/products/${product.handle}`,
            },
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        upsert: true,
      },
    });
    if (!plan.listing.existing) {
      addBackup("onlinelistings", { _id: plan.listing.id }, "create");
    }
  }

  const fallbackHeroPlan =
    productPlans.find(
      (plan) => plan.source.handle === "pixl-6000-disposable-vape"
    ) || productPlans[0];
  if (fallbackHeroPlan) {
    const fallbackImage = normalizeImageUrl(
      fallbackHeroPlan.source.images?.[0]?.src || ""
    );
    for (const slide of heroSlides) {
      if (targetListingIds.has(String(slide.listing || ""))) continue;
      heroOperations.push({
        updateOne: {
          filter: { _id: slide._id, store: store._id },
          update: {
            $set: {
              listing: fallbackHeroPlan.listing.id,
              image: fallbackImage,
              updatedAt: new Date(),
            },
          },
        },
      });
    }
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(
      async () => {
        if (backupEntries.length) {
          await backups.insertMany(backupEntries, { session, ordered: true });
        }
        if (categoryOperations.length) {
          await Category.bulkWrite(categoryOperations, { session, ordered: true });
        }
        await OnlineCategory.bulkWrite(onlineCategoryOperations, {
          session,
          ordered: true,
        });
        if (productOperations.length) {
          await Product.bulkWrite(productOperations, { session, ordered: true });
        }
        await OnlineListing.bulkWrite(listingOperations, {
          session,
          ordered: true,
        });
        if (heroOperations.length) {
          await OnlineHeroSlide.bulkWrite(heroOperations, {
            session,
            ordered: true,
          });
        }
        await runs.updateOne(
          { sourceHash },
          {
            $set: {
              status: "completed",
              summary,
              priceCorrections: corrections,
              unresolvedPrices,
              appliedAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { session }
        );
      },
      {
        maxCommitTimeMS: 120000,
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      }
    );
    console.log(`\nAPPLIED ${runId}`);
  } catch (error) {
    await runs.updateOne(
      { sourceHash },
      {
        $set: {
          status: "failed",
          error: error.message,
          updatedAt: new Date(),
        },
      }
    );
    throw error;
  } finally {
    await session.endSession();
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
