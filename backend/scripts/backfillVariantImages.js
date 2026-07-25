/*
 * Backfill per-flavour (variant) images from the shop's old Shopify store.
 *
 * The original import capped each listing's gallery at 8 photos, so most
 * products lost their per-flavour images. But the source Shopify store still
 * exposes every variant's own picture via `variant.featured_image`. This script
 * pulls those and links them onto our OnlineListing variants — matched by the
 * product handle (== our listing slug) and the flavour/option name.
 *
 * Safe by default: only fills options that have NO image yet. Run with
 *   OVERWRITE=true node scripts/backfillVariantImages.js
 * to (re)set every option from the source wherever the source has an image.
 *
 * Source store is configurable:
 *   SOURCE_SHOPIFY_DOMAIN=candycloud-vape.myshopify.com (default)
 */
require("dotenv").config();
const mongoose = require("mongoose");
const OnlineListing = require("../models/OnlineListingmodel");
// Registers the referenced model so populate("product") works.
require("../models/Productmodel");

const STORE =
  process.env.SOURCE_SHOPIFY_DOMAIN || "candycloud-vape.myshopify.com";
const OVERWRITE = process.env.OVERWRITE === "true";

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// Pull the whole Shopify catalogue and build:
//   byHandle: handle      -> Map(normalisedVariantTitle -> imageSrc)
//   byTitle:  normTitle   -> same map (fallback when slug != handle)
async function loadSource() {
  const byHandle = new Map();
  const byTitle = new Map();
  let page = 1;
  let products = 0;
  while (page <= 40) {
    const res = await fetch(
      `https://${STORE}/products.json?limit=250&page=${page}`,
    );
    if (!res.ok) throw new Error(`Source fetch failed: ${res.status}`);
    const batch = (await res.json()).products || [];
    if (!batch.length) break;
    for (const product of batch) {
      const imgById = new Map(
        (product.images || []).map((image) => [String(image.id), image.src]),
      );
      const variantImages = new Map();
      for (const variant of product.variants || []) {
        const src =
          variant.featured_image?.src ||
          (variant.image_id ? imgById.get(String(variant.image_id)) : "");
        if (src) variantImages.set(norm(variant.title), src);
      }
      byHandle.set(product.handle, variantImages);
      byTitle.set(norm(product.title), variantImages);
      products += 1;
    }
    page += 1;
  }
  return { byHandle, byTitle, products };
}

(async () => {
  try {
    console.log(`[backfill] source store: ${STORE} (overwrite=${OVERWRITE})`);
    const { byHandle, byTitle, products } = await loadSource();
    console.log(`[backfill] loaded ${products} source products`);

    await mongoose.connect(process.env.MONGODB_URL || process.env.MONGODB_URI);
    const listings = await OnlineListing.find({}).populate("product", "name");
    console.log(`[backfill] scanning ${listings.length} listings…`);

    let filled = 0;
    let cleared = 0;
    let changedListings = 0;
    let noSourceProduct = 0;
    let noSourceImage = 0;

    for (const listing of listings) {
      if (!listing.variants || !listing.variants.length) continue;
      const map =
        byHandle.get(listing.slug) ||
        byTitle.get(norm(listing.webName || listing.product?.name || ""));
      if (!map) {
        noSourceProduct += 1;
        continue;
      }
      let changed = false;
      for (const variant of listing.variants) {
        const src = map.get(norm(variant.label));
        if (src) {
          // The source store has this flavour's own image.
          if (variant.image === src) continue;
          if (variant.image && !OVERWRITE) continue;
          variant.image = src;
          filled += 1;
          changed = true;
        } else if (OVERWRITE && variant.image) {
          // No source image for this option — in OVERWRITE mode, clear any
          // previously (mis)assigned image so it falls back to the main photo
          // instead of showing the wrong flavour.
          variant.image = "";
          cleared += 1;
          changed = true;
        } else if (!variant.image) {
          noSourceImage += 1;
        }
      }
      if (changed) {
        await listing.save();
        changedListings += 1;
        console.log(
          `  ✓ ${listing.webName || listing.product?.name || listing.slug}`,
        );
      }
    }

    console.log("──────────────────────────────────────────────");
    console.log(`[backfill] variant images set : ${filled}`);
    console.log(`[backfill] variant images cleared (no source): ${cleared}`);
    console.log(`[backfill] listings updated    : ${changedListings}`);
    console.log(`[backfill] listings w/o source : ${noSourceProduct}`);
    console.log(`[backfill] options w/o source image: ${noSourceImage}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("[backfill] failed:", error.message);
    process.exit(1);
  }
})();
