/* Apply the approved product alt text to every storefront image surface.
 *
 * Dry run (default): npm run storefront-alt-text
 * Apply:             npm run storefront-alt-text -- --yes
 *
 * The extracted workbook mapping is committed as data, so production does not
 * need Excel or the original 21 MB workbook. A backup is written before any
 * listing changes, and unmatched rows are reported rather than guessed.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Product = require("../models/Productmodel");
const OnlineListing = require("../models/OnlineListingmodel");

const DATA_FILE = path.join(__dirname, "..", "data", "storefront-alt-text.json");
const BACKUP_DIR = path.join(__dirname, "backups");
const APPLY = process.argv.includes("--yes");

const normalize = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

function buildAltMap(rows) {
  const map = new Map();
  const conflicts = [];
  for (const row of rows) {
    const key = normalize(row.product);
    const alt = String(row.alt || "").trim().slice(0, 160);
    if (!key || !alt) continue;
    if (map.has(key) && map.get(key) !== alt) conflicts.push({ product: row.product, alts: [map.get(key), alt] });
    else map.set(key, alt);
  }
  return { map, conflicts };
}

const altFor = (map, ...names) => {
  for (const name of names) {
    const hit = map.get(normalize(name));
    if (hit) return hit;
  }
  return "";
};

const readPath = (object, dotted) => dotted.split(".").reduce((value, key) => value?.[key], object);

async function main() {
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not configured");
  const source = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const { map, conflicts } = buildAltMap(source.rows || []);
  if (conflicts.length) throw new Error(`Alt-text source has ${conflicts.length} conflicting duplicate product names`);

  await mongoose.connect(process.env.MONGODB_URL);
  const listings = await OnlineListing.find({})
    .populate("product", "name")
    .populate("variants.product", "name")
    .populate("linkedListings.listing", "webName product")
    .lean();

  const productIds = new Set();
  for (const listing of listings) {
    if (listing.product?._id) productIds.add(String(listing.product._id));
    for (const variant of listing.variants || []) if (variant.product?._id) productIds.add(String(variant.product._id));
  }
  const productNames = new Map((await Product.find({ _id: { $in: [...productIds] } }).select("name").lean())
    .map((product) => [String(product._id), product.name]));

  const listingMainAlt = new Map();
  for (const listing of listings) {
    const productName = listing.product?.name || productNames.get(String(listing.product)) || "";
    listingMainAlt.set(String(listing._id), altFor(map, productName, listing.webName));
  }

  const plans = [];
  const matchedSourceKeys = new Set();
  for (const listing of listings) {
    const productName = listing.product?.name || productNames.get(String(listing.product)) || "";
    const mainAlt = altFor(map, productName, listing.webName);
    const set = {};
    let imageCount = 0;

    if (mainAlt) {
      matchedSourceKeys.add(normalize(productName));
      matchedSourceKeys.add(normalize(listing.webName));
      set["catalogImage.alt"] = mainAlt; // also fallback for a Product-owned image
      (listing.gallery || []).forEach((image, index) => {
        if (!image.url) return;
        set[`gallery.${index}.alt`] = mainAlt;
        imageCount += 1;
      });
      if (listing.catalogImage?.url) imageCount += 1;
      if (listing.dealImage?.url) {
        set["dealImage.alt"] = mainAlt;
        imageCount += 1;
      }
    }

    (listing.variants || []).forEach((variant, index) => {
      const name = variant.product?.name || productNames.get(String(variant.product)) || "";
      const alt = altFor(map, name, variant.label);
      if (!alt || !variant.image) return;
      set[`variants.${index}.imageAlt`] = alt;
      matchedSourceKeys.add(normalize(name));
      imageCount += 1;
    });

    (listing.linkedListings || []).forEach((link, index) => {
      const targetId = link.listing?._id || link.listing;
      const alt = listingMainAlt.get(String(targetId)) || altFor(map, link.label);
      if (!alt || !link.image) return;
      set[`linkedListings.${index}.imageAlt`] = alt;
      imageCount += 1;
    });

    if (Object.keys(set).length) plans.push({ listing, set, imageCount, mainAlt });
  }

  const unmatched = [...map.keys()].filter((key) => !matchedSourceKeys.has(key));
  const changedFields = plans.reduce((sum, plan) => sum + Object.keys(plan.set).length, 0);
  const fieldsNeedingChange = plans.reduce((sum, plan) => sum + Object.entries(plan.set)
    .filter(([field, value]) => readPath(plan.listing, field) !== value).length, 0);
  const imageCount = plans.reduce((sum, plan) => sum + plan.imageCount, 0);
  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    sourceRows: source.rows.length,
    uniqueSourceProducts: map.size,
    storefrontListings: listings.length,
    matchedListings: plans.length,
    imageSurfaces: imageCount,
    fieldsToWrite: changedFields,
    fieldsNeedingChange,
    unmatchedSourceProducts: unmatched.length,
  }, null, 2));

  if (!APPLY) {
    console.log("No data changed. Re-run with --yes to apply.");
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(BACKUP_DIR, `storefront-alt-text-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify({
    createdAt: new Date().toISOString(),
    source: source.source,
    listings: plans.map(({ listing }) => ({
      _id: listing._id,
      gallery: listing.gallery,
      catalogImage: listing.catalogImage,
      dealImage: listing.dealImage,
      variants: listing.variants,
      linkedListings: listing.linkedListings,
    })),
  }, null, 2));

  const operations = plans.map(({ listing, set }) => ({
    updateOne: { filter: { _id: listing._id }, update: { $set: set } },
  }));
  if (operations.length) await OnlineListing.bulkWrite(operations, { ordered: false });
  const saved = await OnlineListing.find({ _id: { $in: plans.map((plan) => plan.listing._id) } }).lean();
  const savedById = new Map(saved.map((listing) => [String(listing._id), listing]));
  const mismatches = plans.flatMap((plan) => Object.entries(plan.set)
    .filter(([field, value]) => readPath(savedById.get(String(plan.listing._id)), field) !== value)
    .map(([field]) => ({ listing: String(plan.listing._id), field })));
  if (mismatches.length) throw new Error(`Verification failed: ${mismatches.length} alt-text fields did not persist`);
  console.log(`Applied alt text to ${imageCount} storefront image surfaces. Backup: ${backup}`);
  console.log("Verification passed: every matched storefront image has the workbook alt text.");
}

if (require.main === module) {
  main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
}

module.exports = { normalize, buildAltMap, altFor };
