/*
 * Export every product variant (flavour / colour / option) that still has NO
 * image, straight from the live catalogue. Regenerate this whenever product or
 * flavour names change — the suggested filenames are derived from the current
 * labels, so a stale CSV points at the wrong files.
 *
 *   node scripts/exportMissingVariantImages.js
 *
 * Writes ./store-missing-images-<date>.csv at the repo root (one row per option
 * without an image). Set OUT=some/path.csv to choose the file, or
 * INCLUDE_UNLISTED=true to also include products not yet live on the site.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const OnlineListing = require("../models/OnlineListingmodel");
// Registers the referenced model so populate("product") works.
require("../models/Productmodel");

// "Apple Juice" -> "apple-juice.webp" — the filename the shop is expected to
// supply for this option. Kept identical to how the storefront would slug it.
const suggestedFile = (label) =>
  `${String(label || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}.webp`;

// RFC-4180 field: wrap in quotes, double any embedded quote.
const csv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

(async () => {
  try {
    const includeUnlisted = process.env.INCLUDE_UNLISTED === "true";
    const out =
      process.env.OUT ||
      path.join(
        __dirname,
        "..",
        "..",
        `store-missing-images-${new Date().toISOString().slice(0, 10)}.csv`,
      );

    await mongoose.connect(process.env.MONGODB_URL || process.env.MONGODB_URI);
    const query = includeUnlisted ? {} : { listed: true };
    const listings = await OnlineListing.find(query)
      .populate("product", "name")
      .sort({ sortWeight: 1 })
      .lean();
    console.log(`[export] scanning ${listings.length} listings…`);

    const rows = [
      ["Product", "ListingSlug", "Option", "Kind", "SuggestedFileName"]
        .map(csv)
        .join(","),
    ];
    let missing = 0;
    let listingsAffected = 0;

    for (const listing of listings) {
      const name = listing.webName || listing.product?.name || listing.slug;
      const gaps = (listing.variants || []).filter((v) => !v.image);
      if (!gaps.length) continue;
      listingsAffected += 1;
      for (const variant of gaps) {
        rows.push(
          [
            name,
            listing.slug,
            variant.label,
            variant.kind || "option",
            suggestedFile(variant.label),
          ]
            .map(csv)
            .join(","),
        );
        missing += 1;
      }
    }

    fs.writeFileSync(out, rows.join("\r\n") + "\r\n", "utf8");
    console.log("──────────────────────────────────────────────");
    console.log(`[export] options missing an image : ${missing}`);
    console.log(`[export] products affected        : ${listingsAffected}`);
    console.log(`[export] written                  : ${out}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("[export] failed:", error.message);
    process.exit(1);
  }
})();
