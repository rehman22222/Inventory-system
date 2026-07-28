/*
 * Make the shop's "Website price" (listing.priceOverride) actually control the
 * online price again.
 *
 * At import every VARIANT got a frozen priceOverride. Because the storefront
 * prefers a variant's override over the listing price, editing the Website price
 * in admin never showed online. This clears variant overrides ONLY when every
 * variant of a listing shares the SAME price (uniform flavour pricing) — so the
 * listing's Website price takes effect — while leaving:
 *   • pack-size / multi-price variants (e.g. gummy 5/10/25 packs) untouched, and
 *   • offer/bundle listings untouched, and
 *   • the listing-level priceOverride (the Website price) untouched.
 *
 *   node scripts/clearOnlinePriceOverrides.js            # DRY RUN — counts only
 *   APPLY=true node scripts/clearOnlinePriceOverrides.js # actually clear
 */
require("dotenv").config();
const mongoose = require("mongoose");
const OnlineListing = require("../models/OnlineListingmodel");
require("../models/Productmodel"); // register for populate("product")

const APPLY = process.env.APPLY === "true";
const isOffer = (name) => /\boffer\b|\bbuy\b|pcs for|for €?\d/i.test(String(name || ""));

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL || process.env.MONGODB_URI);
    // Only live listings matter for the storefront; unlisted duplicates are hidden.
    const listings = await OnlineListing.find({ listed: true }).populate("product", "name");

    let listingsFixed = 0;
    let variantsCleared = 0;
    let keptMultiPrice = 0;
    const changedExamples = [];
    const keptExamples = [];

    for (const listing of listings) {
      const label = listing.webName || listing.product?.name || listing.slug;
      const withOverride = (listing.variants || []).filter((v) => v.priceOverride != null);
      if (withOverride.length === 0) continue;
      if (isOffer(label)) continue;

      const values = new Set(withOverride.map((v) => Number(v.priceOverride)));
      // Multi-price variants (pack sizes etc.) are deliberate — never touch them.
      if (values.size > 1) {
        keptMultiPrice += 1;
        if (keptExamples.length < 10) keptExamples.push(`${label} (${[...values].join("/")})`);
        continue;
      }

      // Uniform flavour pricing → the variant override is redundant; clearing it
      // lets the listing's Website price / product price control.
      for (const v of withOverride) v.priceOverride = null;
      variantsCleared += withOverride.length;
      listingsFixed += 1;
      if (changedExamples.length < 12)
        changedExamples.push(`${label}: variant €${[...values][0]} -> Website €${listing.priceOverride ?? "(shelf)"}`);
      if (APPLY) {
        listing.markModified("variants");
        await listing.save();
      }
    }

    console.log(`[overrides] listings scanned                 : ${listings.length}`);
    console.log(`[overrides] listings fixed (uniform variants): ${listingsFixed}`);
    console.log(`[overrides] variant overrides cleared        : ${variantsCleared}`);
    console.log(`[overrides] multi-price listings KEPT        : ${keptMultiPrice}`);
    console.log("[overrides] changed examples:");
    changedExamples.forEach((e) => console.log("   " + e));
    console.log("[overrides] kept (multi-price) examples:");
    keptExamples.forEach((e) => console.log("   " + e));
    console.log(
      APPLY
        ? "\n[overrides] APPLIED — Website price now controls these listings."
        : "\n[overrides] DRY RUN — nothing changed. Run with APPLY=true.",
    );
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("[overrides] failed:", error.message);
    process.exit(1);
  }
})();
