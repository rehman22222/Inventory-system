/* Import the Candy Cloud public catalogue into inventory + Online Store.
 *
 * Safety:
 * - dry-run by default; pass --apply to write;
 * - workbook/archive SHA-256 makes an applied run idempotent;
 * - no fuzzy match is ever written;
 * - reviewed aliases below are flavour/typo matches inspected against the DB;
 * - existing inventory stock, cost, price and category are never overwritten;
 * - missing inventory rows start at quantity=0 and costPrice=0;
 * - MongoDB changes are one transaction and every mutation is backed up;
 * - ZIP images are uploaded before the transaction and removed if it fails.
 */
require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const { SaxesParser } = require("saxes");
const mongoose = require("mongoose");

const Product = require("../models/Productmodel");
const Category = require("../models/ Categorymodel");
const Store = require("../models/Storemodel");
const OnlineCategory = require("../models/OnlineCategorymodel");
const OnlineListing = require("../models/OnlineListingmodel");
const { uploadImage, deleteImage } = require("../libs/cloudinaryImage");

const APPLY = process.argv.includes("--apply");
const args = process.argv.filter((arg) => !arg.startsWith("--"));
const workbookArg = args.find((arg) => /\.xlsx$/i.test(arg));
const imagesArg = args.find((arg) => /\.zip$/i.test(arg));
const WORKBOOK = path.resolve(
  workbookArg || "C:/Users/dell/Downloads/candycloud_public_catalog.xlsx"
);
const IMAGES = path.resolve(
  imagesArg || "C:/Users/dell/Downloads/Images from Store For Store.zip"
);

const PRODUCT_SHEET = "xl/worksheets/sheet4.xml";
const VARIANT_SHEET = "xl/worksheets/sheet5.xml";

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const money = (value) => Math.round(Number(value || 0) * 100) / 100;
const slugify = (value) =>
  text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const normalizedName = (value) =>
  text(value)
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
const hash = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");

const reviewedKey = (product, variant) =>
  `${normalizedName(product)}||${normalizedName(variant)}`;

// These are exact, manually reviewed inventory records. Similar-looking sizes,
// broad parent rows and different flavours are deliberately not included.
const REVIEWED_VARIANT_ALIASES = new Map(
  [
    [
      "LOOM Cali Magic Disposable-2ml Flavours",
      "Blueberry kush (Indica)",
      "LOOM 2ML BLUEBERRY KUCH",
    ],
    [
      "LOOM Cali Magic Disposable-2ml Flavours",
      "Lemon Sunk",
      "LOOM 2ML LEMON SKUNK",
    ],
    [
      "LOOM Cali Magic Disposable-2ml Flavours",
      "OG Glue",
      "LOOM 2ML OG GLUE",
    ],
    [
      "LOOM Cali Magic Disposable-2ml Flavours",
      "PineApple (Sativa)",
      "LOOM 2ML PINEAPPLE",
    ],
    [
      "LOOM Cali Magic Disposable-2ml Flavours",
      "Zkittlez (Indica)",
      "LOOM 2ML ZKITTLEZ",
    ],
    [
      "BOOM PRO 3ML PREMIUM FLAVOURS",
      "BUDDHA HAZE",
      "BOOM PRO 3ML BUDDHA HAZE",
    ],
    [
      "BOOM PRO 3ML PREMIUM FLAVOURS",
      "DURBAN ZELATO",
      "BOOM PRO 3ML DURBAN ZELATO HAZE",
    ],
    [
      "BOOM PRO 3ML PREMIUM FLAVOURS",
      "GORILLA GLUE",
      "BOOM PRO 3ML GORILLA GLUE HAZE",
    ],
    [
      "BOOM PRO 3ML PREMIUM FLAVOURS",
      "MANGO KUSH",
      "boom pro mango kush",
    ],
    [
      "BOOM PRO 3ML PREMIUM FLAVOURS",
      "STRAWBERRY DIESEL",
      "BOOM PRO 3ML STRAWBERRY DIESEL HAZE",
    ],
    [
      "BOOM PRO 3ML PREMIUM FLAVOURS",
      "WHITE WIDOW",
      "BOOM PRO 3ML WHITEWIDOW HAZE",
    ],
    [
      "BOOM PRO 3ML PREMIUM FLAVOURS",
      "ZKITTLEZ",
      "BOOM PRO 3ML ZKITTLEZ HAZE",
    ],
  ].map(([product, variant, inventory]) => [
    reviewedKey(product, variant),
    normalizedName(inventory),
  ])
);

const localImageRules = {
  "12": (entry) =>
    /NIC Salts\//i.test(entry) &&
    (/ELFLIQ ELF BAR E LIQUID/i.test(entry) ||
      /(?:^|[/_ -])elfliq.*Quick View/i.test(entry)),
  "18": (entry) =>
    /CBD EDIBLE COLLECTION\//i.test(entry) &&
    (/ACAN_99_/i.test(entry) || /ACAN superior blend gummies 99$/i.test(entry)),
  "26": (entry) =>
    /IVG VAPE RANGE\//i.test(entry) &&
    /IVG SMART 5500 RECHARGEABLE VAPE KIT/i.test(entry),
  "27": (entry) =>
    /CBD EDIBLE COLLECTION\//i.test(entry) && /AZTEC/i.test(entry),
  "30": (entry) =>
    /CBD EDIBLE COLLECTION\//i.test(entry) &&
    /ACAN superior blend gummies/i.test(entry) &&
    !/ACAN_99_|gummies 99$/i.test(entry),
  "36": (entry) =>
    /IVG 6000 NIC SALTS|IVG Intense Salt|NIC Salts\/IVG 6000$|IVG INTENSE SALTS 20MG/i.test(
      entry
    ),
};

const columnNumber = (cellReference) => {
  const letters = text(cellReference).match(/[A-Z]+/)?.[0] || "";
  let total = 0;
  for (const letter of letters) {
    total = total * 26 + letter.charCodeAt(0) - 64;
  }
  return total;
};

const parseSheet = async (zip, sheetPath) => {
  const file = zip.file(sheetPath);
  if (!file) throw new Error(`Workbook is missing ${sheetPath}`);
  const xml = await file.async("string");
  const rows = [];
  let row = null;
  let cell = null;
  let value = "";
  let inValue = false;
  let inText = false;
  const parser = new SaxesParser({ xmlns: false });

  parser.on("opentag", (tag) => {
    const name = tag.name.split(":").pop();
    if (name === "row") row = {};
    if (name === "c") cell = { reference: tag.attributes.r };
    if (name === "v") {
      value = "";
      inValue = true;
    }
    if (name === "t") {
      value = "";
      inText = true;
    }
  });
  parser.on("text", (chunk) => {
    if (inValue || inText) value += chunk;
  });
  parser.on("closetag", (tag) => {
    const raw = typeof tag === "string" ? tag : tag.name;
    const name = raw.split(":").pop();
    if (name === "v") {
      inValue = false;
      if (cell) cell.value = value;
    }
    if (name === "t") {
      inText = false;
      if (cell) cell.value = `${cell.value || ""}${value}`;
    }
    if (name === "c") {
      if (row && cell) row[columnNumber(cell.reference)] = cell.value || "";
      cell = null;
    }
    if (name === "row") {
      if (row) rows.push(row);
      row = null;
    }
  });
  parser.write(xml).close();
  return rows;
};

const recordsFromSheet = async (zip, sheetPath) => {
  const rows = await parseSheet(zip, sheetPath);
  if (rows.length < 2) return [];
  const maxColumn = Math.max(...Object.keys(rows[0]).map(Number));
  const headers = {};
  for (let column = 1; column <= maxColumn; column += 1) {
    headers[column] = text(rows[0][column]);
  }
  return rows.slice(1).map((row) =>
    Object.fromEntries(
      Object.entries(headers)
        .filter(([, header]) => header)
        .map(([column, header]) => [header, text(row[column])])
    )
  );
};

const imageType = (buffer) => {
  if (buffer.slice(8, 12).toString("ascii") === "WEBP") {
    return { extension: "webp", mimetype: "image/webp" };
  }
  if (buffer.slice(4, 12).toString("ascii") === "ftypavif") {
    return { extension: "avif", mimetype: "image/avif" };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return { extension: "jpg", mimetype: "image/jpeg" };
  }
  throw new Error("Unsupported image type in archive");
};

const categoryDescription = (name) =>
  `Candy Cloud online catalogue: ${name.replace(/\s+Ireland$/i, "")}.`;

const productDescription = (product) => {
  const parts = [
    product.Brand && `Brand: ${product.Brand}.`,
    product["Type / Format"] && `Format: ${product["Type / Format"]}.`,
    product["Strength / Size"] && `Strength / size: ${product["Strength / Size"]}.`,
    product.Notes,
  ].filter(Boolean);
  return parts.join(" ");
};

const galleryEntriesFor = (productId, imageEntries) => {
  const rule = localImageRules[productId];
  if (!rule) return [];
  return imageEntries
    .filter(rule)
    .sort((left, right) => path.basename(left).length - path.basename(right).length)
    .slice(0, 8);
};

const variantImage = (label, uploaded) => {
  const meaningful = normalizedName(label)
    .split(" ")
    .filter(
      (token) =>
        token.length > 2 &&
        !["INDICA", "SATIVA", "HYBIRD", "HYBRID", "QUICK", "VIEW"].includes(token)
    );
  if (!meaningful.length) return "";
  return (
    uploaded.find(({ entry }) => {
      const normalizedEntry = normalizedName(path.basename(entry));
      return meaningful.every((token) => normalizedEntry.includes(token));
    })?.url || ""
  );
};

const main = async () => {
  if (!fs.existsSync(WORKBOOK)) throw new Error(`Workbook not found: ${WORKBOOK}`);
  if (!fs.existsSync(IMAGES)) throw new Error(`Image archive not found: ${IMAGES}`);
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not configured");

  const workbookBuffer = fs.readFileSync(WORKBOOK);
  const imageBuffer = fs.readFileSync(IMAGES);
  const workbookHash = hash(workbookBuffer);
  const imageHash = hash(imageBuffer);
  const sourceHash = hash(Buffer.from(`${workbookHash}:${imageHash}`));
  const runId = `online-catalog-${sourceHash.slice(0, 12)}`;

  const workbookZip = await JSZip.loadAsync(workbookBuffer);
  const imageZip = await JSZip.loadAsync(imageBuffer);
  const productRows = (await recordsFromSheet(workbookZip, PRODUCT_SHEET)).filter(
    (row) => row["Product ID"] && row["Product Name"]
  );
  const variantRows = (await recordsFromSheet(workbookZip, VARIANT_SHEET)).filter(
    (row) => row["Product Name"] && row["Variant Value"]
  );
  const variantsByProduct = new Map();
  for (const variant of variantRows) {
    const key = normalizedName(variant["Product Name"]);
    if (!variantsByProduct.has(key)) variantsByProduct.set(key, []);
    variantsByProduct.get(key).push(variant);
  }

  const imageEntries = Object.values(imageZip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name);
  const localImagesByProduct = new Map(
    productRows.map((product) => [
      product["Product ID"],
      galleryEntriesFor(product["Product ID"], imageEntries),
    ])
  );

  await mongoose.connect(process.env.MONGODB_URL);
  const runs = mongoose.connection.db.collection("onlineCatalogImportRuns");
  const backups = mongoose.connection.db.collection("onlineCatalogImportBackups");
  await runs.createIndex({ sourceHash: 1 }, { unique: true });

  const completed = await runs.findOne({ sourceHash, status: "completed" });
  if (completed) {
    console.log(`Already applied as ${completed.runId}; no changes made.`);
    return;
  }

  const store = await Store.findOne({ key: "shop" }).lean();
  if (!store) throw new Error("Store is not configured");
  if (store.currency !== "EUR") {
    throw new Error(
      `Store currency is ${store.currency}; this EUR-only catalogue was not imported`
    );
  }

  const inventory = await Product.find({}).select("name Price costPrice quantity Category image").lean();
  const inventoryByName = new Map();
  for (const product of inventory) {
    const key = normalizedName(product.name);
    if (!inventoryByName.has(key)) inventoryByName.set(key, []);
    inventoryByName.get(key).push(product);
  }
  const categories = await Category.find({}).lean();
  const categoryByName = new Map(
    categories.map((category) => [normalizedName(category.name), category])
  );
  const onlineCategories = await OnlineCategory.find({ store: store._id }).lean();
  const onlineCategoryBySlug = new Map(
    onlineCategories.map((category) => [category.slug, category])
  );

  const usedInventoryIds = new Set();
  const plan = [];
  for (const product of productRows) {
    const primaryCategory = text(product.Categories).split(";")[0].trim() || "Other";
    const exactParents = inventoryByName.get(normalizedName(product["Product Name"])) || [];
    if (exactParents.length > 1) {
      throw new Error(`Ambiguous exact inventory match: ${product["Product Name"]}`);
    }
    const parentMatch = exactParents[0] || null;
    if (parentMatch) usedInventoryIds.add(String(parentMatch._id));

    const variants = [];
    for (const row of variantsByProduct.get(normalizedName(product["Product Name"])) || []) {
      const generatedName = `${product["Product Name"]} — ${row["Variant Value"]}`;
      const exact = inventoryByName.get(normalizedName(generatedName)) || [];
      const aliasName = REVIEWED_VARIANT_ALIASES.get(
        reviewedKey(product["Product Name"], row["Variant Value"])
      );
      const alias = aliasName ? inventoryByName.get(aliasName) || [] : [];
      if (exact.length > 1 || alias.length > 1) {
        throw new Error(`Ambiguous inventory variant: ${generatedName}`);
      }
      const matched = exact[0] || alias[0] || null;
      if (matched && usedInventoryIds.has(String(matched._id))) {
        throw new Error(`Inventory product reused by multiple catalogue variants: ${matched.name}`);
      }
      if (matched) usedInventoryIds.add(String(matched._id));
      variants.push({ row, generatedName, matched, matchType: exact[0] ? "exact" : alias[0] ? "reviewed" : "new" });
    }

    plan.push({
      source: product,
      primaryCategory,
      parentMatch,
      variants,
      localImages: localImagesByProduct.get(product["Product ID"]) || [],
    });
  }

  const categoryNames = [...new Set(plan.map((item) => item.primaryCategory))];
  const newCategoryCount = categoryNames.filter(
    (name) => !categoryByName.has(normalizedName(name))
  ).length;
  const newOnlineCategoryCount = categoryNames.filter(
    (name) => !onlineCategoryBySlug.has(slugify(name))
  ).length;
  const summary = {
    sourceProducts: plan.length,
    sourceVariants: plan.reduce((sum, item) => sum + item.variants.length, 0),
    inventoryParentsMatched: plan.filter((item) => item.parentMatch).length,
    inventoryParentsCreated: plan.filter((item) => !item.parentMatch).length,
    inventoryVariantsMatched: plan.reduce(
      (sum, item) => sum + item.variants.filter((variant) => variant.matched).length,
      0
    ),
    inventoryVariantsCreated: plan.reduce(
      (sum, item) => sum + item.variants.filter((variant) => !variant.matched).length,
      0
    ),
    inventoryCategoriesCreated: newCategoryCount,
    onlineCategoriesCreated: newOnlineCategoryCount,
    localImagesSelected: plan.reduce(
      (sum, item) => sum + item.localImages.length,
      0
    ),
  };

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} ${runId}`);
  console.log(JSON.stringify(summary, null, 2));
  for (const item of plan) {
    console.log(
      JSON.stringify({
        id: item.source["Product ID"],
        name: item.source["Product Name"],
        category: item.primaryCategory,
        parent: item.parentMatch ? `match:${item.parentMatch.name}` : "create",
        variants: item.variants.map((variant) => ({
          value: variant.row["Variant Value"],
          action: variant.matched
            ? `${variant.matchType}:${variant.matched.name}`
            : `create:${variant.generatedName}`,
        })),
        images: item.localImages.map((entry) => path.basename(entry)),
        remoteImage: item.source["Image URL"] || "",
      })
    );
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply after reviewing this plan.");
    return;
  }

  const run = await runs.findOneAndUpdate(
    { sourceHash },
    {
      $setOnInsert: {
        runId,
        sourceHash,
        workbookHash,
        imageHash,
        workbookPath: WORKBOOK,
        imageArchivePath: IMAGES,
        createdAt: new Date(),
        uploads: [],
      },
      $set: { status: "uploading", summary, updatedAt: new Date() },
    },
    { upsert: true, returnDocument: "after" }
  );
  const uploadCache = new Map(
    (run?.uploads || []).map((upload) => [upload.entry, upload])
  );
  const uploadedByProduct = new Map();
  const newlyUploaded = [];

  try {
    for (const item of plan) {
      const uploaded = [];
      for (const entryName of item.localImages) {
        let image = uploadCache.get(entryName);
        if (!image) {
          const buffer = await imageZip.file(entryName).async("nodebuffer");
          const type = imageType(buffer);
          const result = await uploadImage(
            { buffer, mimetype: type.mimetype },
            `online_store/catalog_${sourceHash.slice(0, 12)}`
          );
          image = { entry: entryName, ...result, mimetype: type.mimetype };
          uploadCache.set(entryName, image);
          newlyUploaded.push(image);
          await runs.updateOne(
            { sourceHash },
            { $push: { uploads: image }, $set: { updatedAt: new Date() } }
          );
        }
        uploaded.push(image);
      }
      uploadedByProduct.set(item.source["Product ID"], uploaded);
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const transactionCategories = new Map(categoryByName);
        const transactionOnlineCategories = new Map(onlineCategoryBySlug);

        for (const name of categoryNames) {
          const key = normalizedName(name);
          if (!transactionCategories.has(key)) {
            const category = new Category({
              name,
              description: categoryDescription(name),
            });
            await category.save({ session });
            transactionCategories.set(key, category);
            await backups.insertOne(
              {
                runId,
                collection: "categories",
                operation: "create",
                documentId: category._id,
                before: null,
                createdAt: new Date(),
              },
              { session }
            );
          }

          const slug = slugify(name);
          if (!transactionOnlineCategories.has(slug)) {
            const onlineCategory = new OnlineCategory({
              store: store._id,
              name,
              slug,
              description: categoryDescription(name),
              active: true,
              sortWeight: categoryNames.indexOf(name),
            });
            await onlineCategory.save({ session });
            transactionOnlineCategories.set(slug, onlineCategory);
            await backups.insertOne(
              {
                runId,
                collection: "onlinecategories",
                operation: "create",
                documentId: onlineCategory._id,
                before: null,
                createdAt: new Date(),
              },
              { session }
            );
          }
        }

        for (const item of plan) {
          const source = item.source;
          const currentPrice =
            number(source["Current Price Min"]) ??
            number(source["Regular Price Min"]);
          if (currentPrice === null || currentPrice < 0) {
            throw new Error(`Missing price for ${source["Product Name"]}`);
          }
          const category = transactionCategories.get(
            normalizedName(item.primaryCategory)
          );
          const onlineCategory = transactionOnlineCategories.get(
            slugify(item.primaryCategory)
          );
          const uploaded = uploadedByProduct.get(source["Product ID"]) || [];
          const remoteImage = text(source["Image URL"]);
          const uploadedGallery = uploaded.map((image) => ({
            url: image.url,
            publicId: image.publicId,
            alt: source["Product Name"],
          }));
          if (
            remoteImage &&
            !uploadedGallery.some((image) => image.url === remoteImage) &&
            uploadedGallery.length < 8
          ) {
            uploadedGallery.push({
              url: remoteImage,
              publicId: "",
              alt: source["Product Name"],
            });
          }

          let parent = item.parentMatch
            ? await Product.findById(item.parentMatch._id).session(session)
            : null;
          if (!parent) {
            parent = new Product({
              name: source["Product Name"],
              Desciption: productDescription(source),
              Category: category._id,
              Price: money(currentPrice),
              costPrice: 0,
              quantity: 0,
              image: uploadedGallery[0]
                ? {
                    url: uploadedGallery[0].url,
                    publicId: uploadedGallery[0].publicId,
                  }
                : undefined,
            });
            await parent.save({ session });
            await backups.insertOne(
              {
                runId,
                collection: "products",
                operation: "create",
                documentId: parent._id,
                before: null,
                sourceProductId: source["Product ID"],
                createdAt: new Date(),
              },
              { session }
            );
          }

          const listingVariants = [];
          for (const variant of item.variants) {
            let variantProduct = variant.matched
              ? await Product.findById(variant.matched._id).session(session)
              : null;
            const variantPrice =
              number(variant.row["Variant Price"]) ?? currentPrice;
            if (!variantProduct) {
              variantProduct = new Product({
                name: variant.generatedName,
                Desciption: `${productDescription(source)} Option: ${variant.row["Variant Value"]}.`,
                Category: category._id,
                Price: money(variantPrice),
                costPrice: 0,
                quantity: 0,
                image: uploadedGallery[0]
                  ? {
                      url: uploadedGallery[0].url,
                      publicId: uploadedGallery[0].publicId,
                    }
                  : undefined,
              });
              await variantProduct.save({ session });
              await backups.insertOne(
                {
                  runId,
                  collection: "products",
                  operation: "create",
                  documentId: variantProduct._id,
                  before: null,
                  sourceProductId: source["Product ID"],
                  sourceVariantId: variant.row["Variant ID"],
                  createdAt: new Date(),
                },
                { session }
              );
            }
            listingVariants.push({
              product: variantProduct._id,
              label: variant.row["Variant Value"],
              priceOverride: money(variantPrice),
              image: variantImage(variant.row["Variant Value"], uploaded),
            });
          }

          let listing = await OnlineListing.findOne({
            store: store._id,
            product: parent._id,
          }).session(session);
          let slug = slugify(source["Product Name"]) || `catalog-${source["Product ID"]}`;
          const slugClash = await OnlineListing.findOne({
            store: store._id,
            slug,
            product: { $ne: parent._id },
          }).session(session);
          if (slugClash) slug = `${slug}-${source["Product ID"]}`;

          if (listing) {
            await backups.insertOne(
              {
                runId,
                collection: "onlinelistings",
                operation: "update",
                documentId: listing._id,
                before: listing.toObject(),
                sourceProductId: source["Product ID"],
                createdAt: new Date(),
              },
              { session }
            );
          } else {
            listing = new OnlineListing({
              store: store._id,
              product: parent._id,
            });
            await backups.insertOne(
              {
                runId,
                collection: "onlinelistings",
                operation: "create",
                documentId: listing._id,
                before: null,
                sourceProductId: source["Product ID"],
                createdAt: new Date(),
              },
              { session }
            );
          }

          const previousGallery = Array.isArray(listing.gallery)
            ? listing.gallery.map((image) => ({
                url: image.url,
                publicId: image.publicId || "",
                alt: image.alt || source["Product Name"],
              }))
            : [];
          const mergedGallery = [...uploadedGallery, ...previousGallery]
            .filter(
              (image, index, images) =>
                image.url &&
                images.findIndex((candidate) => candidate.url === image.url) === index
            )
            .slice(0, 8);
          const regularPrice = number(source["Regular Price Min"]);
          const discount = number(source["Discount %"]) || 0;

          listing.slug = slug;
          listing.category = onlineCategory._id;
          listing.listed = true;
          listing.webName = source["Product Name"];
          listing.brand = source.Brand || "";
          listing.shortDescription =
            source.Notes ||
            [source["Type / Format"], source["Strength / Size"]]
              .filter(Boolean)
              .join(" · ");
          listing.description = productDescription(source);
          listing.gallery = mergedGallery;
          listing.specs = {
            Brand: source.Brand || "Not specified",
            Format: source["Type / Format"] || "Not specified",
            "Strength / size": source["Strength / Size"] || "Not specified",
            "Source catalogue ID": source["Product ID"],
          };
          listing.flavour = listingVariants.length ? "Multiple options" : "";
          listing.variants = listingVariants;
          listing.tags = discount > 0 ? ["sale"] : [];
          listing.priceOverride = money(currentPrice);
          listing.compareAtPrice =
            regularPrice !== null && regularPrice > currentPrice
              ? money(regularPrice)
              : null;
          listing.seo = {
            title: source["Product Name"],
            description: productDescription(source).slice(0, 155),
          };
          listing.sortWeight = Number(source["Product ID"]) || 0;
          await listing.save({ session });
        }

        await runs.updateOne(
          { sourceHash },
          {
            $set: {
              status: "completed",
              summary,
              appliedAt: new Date(),
              updatedAt: new Date(),
            },
          },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }

    console.log(`\nAPPLIED ${runId}`);
  } catch (error) {
    await Promise.all(
      newlyUploaded.map((image) => deleteImage(image.publicId))
    );
    await runs.updateOne(
      { sourceHash },
      {
        $set: {
          status: "failed",
          error: error.message,
          uploads: [],
          updatedAt: new Date(),
        },
      }
    );
    throw error;
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
