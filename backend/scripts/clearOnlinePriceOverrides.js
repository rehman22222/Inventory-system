/*
 * Make the online store follow the shelf price (Product.Price) again.
 *
 * At import, every listing + variant got a frozen `priceOverride` equal to the
 * price at that moment. Because the storefront prefers priceOverride, later
 * edits to Product.Price never show online. This clears those overrides on
 * REGULAR listings so the online price tracks Product.Price — while leaving
 * offer/bundle listings (whose override is a deliberate multi-buy price) alone.
 *
 *   node scripts/clearOnlinePriceOverrides.js            # DRY RUN — counts only
 *   APPLY=true node scripts/clearOnlinePriceOverrides.js # actually clear
 *
 * Sales (salePrice) are untouched — an active deal still shows its sale price.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const OnlineListing = require("../models/OnlineListingmodel");
require("../models/Productmodel"); // register for populate("product")

const APPLY = process.env.APPLY === "true";
// Deliberate multi-buy / bundle listings — keep their override.
const isOffer = (name) => /\boffer\b|\bbuy\b|pcs for|for €?\d/i.test(String(name || ""));

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL || process.env.MONGODB_URI);
    const listings = await OnlineListing.find({}).populate("product", "name");

    let listingsCleared = 0;
    let variantsCleared = 0;
    let offersKept = 0;
    const keptExamples = [];

    for (const listing of listings) {
      const label = listing.webName || listing.product?.name || listing.slug;
      if (isOffer(label)) {
        if (listing.priceOverride != null || (listing.variants || []).some((v) => v.priceOverride != null))
          offersKept += 1;
        if (keptExamples.length < 10) keptExamples.push(label);
        continue;
      }
      let changed = false;
      if (listing.priceOverride != null) {
        listing.priceOverride = null;
        listingsCleared += 1;
        changed = true;
      }
      for (const v of listing.variants || []) {
        if (v.priceOverride != null) {
          v.priceOverride = null;
          variantsCleared += 1;
          changed = true;
        }
      }
      if (changed && APPLY) {
        listing.markModified("variants");
        await listing.save();
      }
    }

    console.log(`[overrides] listings scanned            : ${listings.length}`);
    console.log(`[overrides] listing overrides to clear  : ${listingsCleared}`);
    console.log(`[overrides] variant overrides to clear  : ${variantsCleared}`);
    console.log(`[overrides] offer/bundle listings kept  : ${offersKept}`);
    console.log(`[overrides] kept examples: ${keptExamples.join(" | ")}`);
    console.log(
      APPLY
        ? "\n[overrides] APPLIED — online prices now follow Product.Price (except offers)."
        : "\n[overrides] DRY RUN — nothing changed. Run with APPLY=true to clear.",
    );
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("[overrides] failed:", error.message);
    process.exit(1);
  }
})();
