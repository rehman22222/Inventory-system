/*
 * Backfill per-flavour (variant) images for ONE listing from the shop's live
 * WooCommerce site, re-hosting each image onto our own Cloudinary.
 *
 * WooCommerce variable products embed every variation (with its own image) in a
 * `data-product_variations` JSON blob on the product page. We match those to our
 * OnlineListing variants by normalised label and fill only the options that have
 * NO image yet.
 *
 *   SOURCE_URL="https://candycloudlongford.com/product/<handle>/" \
 *   LISTING_SLUG="boom-pro-3ml-superior-blend" \
 *   node scripts/backfillVariantImagesFromWoo.js
 *
 * DRY_RUN=true prints the matches without writing anything.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const cloudinary = require("../libs/Cloundinary");
const OnlineListing = require("../models/OnlineListingmodel");
require("../models/Productmodel");

const SOURCE_URL =
  process.env.SOURCE_URL ||
  "https://candycloudlongford.com/product/boom-pro-superior-3ml-flavours/";
const LISTING_SLUG = process.env.LISTING_SLUG || "boom-pro-3ml-superior-blend";
const FOLDER = "online_store";
const DRY_RUN = process.env.DRY_RUN === "true";

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// Pull the WooCommerce variations JSON and map normalisedVariantTitle -> imageSrc.
async function loadSource(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Source page fetch failed: ${res.status}`);
  const html = await res.text();
  const m = html.match(/data-product_variations="([^"]*)"/);
  if (!m) throw new Error("No variations data found on the source page");
  const decoded = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  const variations = JSON.parse(decoded);
  const map = new Map();
  for (const v of variations) {
    const label = Object.values(v.attributes || {}).join(" ");
    const src = (v.image && (v.image.full_src || v.image.src)) || "";
    if (src) map.set(norm(label), src);
  }
  return map;
}

(async () => {
  try {
    if (
      !(process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME) ||
      !(process.env.CLOUDINARY_API_KEY || process.env.API_KEY)
    ) {
      throw new Error("Cloudinary is not configured (set CLOUDINARY_* in .env)");
    }
    console.log(`[woo] source : ${SOURCE_URL}`);
    console.log(`[woo] listing: ${LISTING_SLUG} (dry-run=${DRY_RUN})`);
    const source = await loadSource(SOURCE_URL);
    console.log(`[woo] source has ${source.size} variant images`);

    await mongoose.connect(process.env.MONGODB_URL || process.env.MONGODB_URI);
    const listing = await OnlineListing.findOne({ slug: LISTING_SLUG }).populate(
      "product",
      "name",
    );
    if (!listing) throw new Error(`No listing with slug "${LISTING_SLUG}"`);
    console.log(
      `[woo] listing "${listing.webName || listing.product?.name}" — ${listing.variants.length} variants`,
    );

    let filled = 0;
    let unmatched = 0;
    let changed = false;

    for (const variant of listing.variants) {
      if (variant.image) continue; // never overwrite an existing image
      const src = source.get(norm(variant.label));
      if (!src) {
        unmatched += 1;
        console.log(`  ? ${variant.label} — no match on source`);
        continue;
      }
      if (DRY_RUN) {
        console.log(`  ✓ ${variant.label} <= ${src.split("/").pop()}`);
        filled += 1;
        continue;
      }
      const r = await cloudinary.uploader.upload(src, { folder: FOLDER });
      variant.image = r.secure_url;
      changed = true;
      filled += 1;
      console.log(`  ✓ ${variant.label} -> ${r.secure_url}`);
    }

    if (changed && !DRY_RUN) await listing.save();

    console.log("──────────────────────────────────────────────");
    console.log(`[woo] filled: ${filled}  unmatched: ${unmatched}`);
    console.log(DRY_RUN ? "[woo] DRY RUN — nothing written" : "[woo] saved");
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("[woo] failed:", error.message);
    process.exit(1);
  }
})();
