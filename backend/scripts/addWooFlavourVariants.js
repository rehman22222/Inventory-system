/*
 * Give the Killa and Pablo online listings their flavour options (with images),
 * pulled from the shop's live WooCommerce site via its public Store API.
 *
 * Both listings already exist and are published but carry ZERO variants, so the
 * storefront shows one product with no flavour picker. This script:
 *   1. reads every qty=1 variation (flavour + image) from the Store API,
 *   2. matches each flavour to an existing inventory Product by name (reusing it
 *      so POS/stock stays linked), creating one only when nothing matches,
 *   3. re-hosts each flavour image on our own Cloudinary,
 *   4. writes the variants onto the listing.
 *
 * Prices, stock and the listing itself are left untouched.
 *
 *   node scripts/addWooFlavourVariants.js             # DRY RUN — plan only
 *   APPLY=true node scripts/addWooFlavourVariants.js  # upload + write variants
 */
require("dotenv").config();
const mongoose = require("mongoose");
const cloudinary = require("../libs/Cloundinary");
const OnlineListing = require("../models/OnlineListingmodel");
const Product = require("../models/Productmodel");

const APPLY = process.env.APPLY === "true";
const API = "https://candycloudlongford.com/wp-json/wc/store/v1/products";
const UA = { "User-Agent": "Mozilla/5.0" };
const FOLDER = "online_store";

const TARGETS = [
  { parentId: 41592, slugLike: /^killa-in-special/i, brand: "Killa" },
  { parentId: 41323, slugLike: /^pablo-in-premium|^pablo-flavour|pablo.*special/i, brand: "Pablo" },
];

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

// Every flavour (qty=1) of a WooCommerce parent, as { flavour, image }.
async function loadFlavours(parentId) {
  const parent = await getJson(`${API}/${parentId}`);
  const flavAttr = (parent.attributes || []).find((a) => /flavour/i.test(a.name));
  const slugToName = new Map(
    (flavAttr?.terms || []).map((t) => [t.slug, t.name]),
  );
  const qtyOne = (parent.variations || []).filter((v) =>
    (v.attributes || []).some((a) => /quantity/i.test(a.name) && a.value === "1"),
  );
  const out = [];
  for (const v of qtyOne) {
    const flavSlug =
      (v.attributes || []).find((a) => /flavour/i.test(a.name))?.value || "";
    const name = slugToName.get(flavSlug) || flavSlug;
    const detail = await getJson(`${API}/${v.id}`);
    const image = (detail.images || [])[0]?.src || "";
    out.push({ flavour: name.trim(), image });
    await sleep(120); // be gentle on the source site
  }
  return out;
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL || process.env.MONGODB_URI);

    for (const target of TARGETS) {
      const listing = await OnlineListing.findOne({ slug: target.slugLike });
      if (!listing) {
        console.log(`\n[${target.brand}] listing not found — skipped`);
        continue;
      }
      console.log(
        `\n===== ${target.brand} — "${listing.webName}" (${listing.slug}) =====`,
      );
      console.log(`existing variants: ${(listing.variants || []).length}`);

      const flavours = await loadFlavours(target.parentId);
      console.log(`flavours on the website (qty 1): ${flavours.length}`);

      // Candidate products for this brand, longest name last so exact wins.
      const brandProducts = await Product.find({
        name: new RegExp(target.brand, "i"),
      })
        .select("name Price")
        .lean();

      const usedProductIds = new Set();
      const plan = [];
      let toCreate = 0;
      let missingImage = 0;

      for (const { flavour, image } of flavours) {
        const targetNorm = norm(target.brand + flavour);
        const flavNorm = norm(flavour);

        let match =
          brandProducts.find(
            (p) => !usedProductIds.has(String(p._id)) && norm(p.name) === targetNorm,
          ) ||
          // else a product whose name contains both the brand and the flavour
          brandProducts
            .filter(
              (p) =>
                !usedProductIds.has(String(p._id)) &&
                norm(p.name).includes(flavNorm) &&
                norm(p.name).includes(norm(target.brand)),
            )
            .sort((a, b) => norm(a.name).length - norm(b.name).length)[0];

        if (match) usedProductIds.add(String(match._id));
        else toCreate += 1;
        if (!image) missingImage += 1;

        plan.push({ flavour, image, match });
      }

      console.log(
        `matched to existing products: ${plan.length - toCreate} | to create: ${toCreate} | missing image: ${missingImage}`,
      );
      for (const row of plan) {
        console.log(
          `   ${row.flavour.padEnd(24)} -> ${
            row.match ? row.match.name : "CREATE NEW"
          }${row.image ? "" : "   [no image]"}`,
        );
      }

      if (!APPLY) continue;

      // Apply: create missing products, upload images, build variants.
      const price = listing.priceOverride ?? 7;
      const variants = [];
      for (const row of plan) {
        let productId = row.match?._id;
        if (!productId) {
          // No onlineSource: the Product model has a unique partial index on
          // (provider, storeDomain, productId, variantId, role) that only applies
          // when provider is a string, and every created flavour would share a
          // null productId. Leaving it unset creates a plain product, exactly as
          // the inventory screen would.
          const created = await Product.create({
            name: `${target.brand} ${row.flavour}`,
            Price: price,
            quantity: 0,
          });
          productId = created._id;
        }

        let imageUrl = "";
        if (row.image) {
          try {
            const up = await cloudinary.uploader.upload(row.image, {
              folder: FOLDER,
            });
            imageUrl = up.secure_url;
          } catch (e) {
            console.log(`   ! image upload failed for ${row.flavour}: ${e.message}`);
          }
        }

        variants.push({
          product: productId,
          label: row.flavour,
          kind: "flavour",
          image: imageUrl,
        });
      }

      listing.variants = variants;
      listing.markModified("variants");
      await listing.save();
      console.log(`APPLIED — ${variants.length} variants written to ${listing.slug}`);
    }

    console.log(
      APPLY
        ? "\nDone."
        : "\nDRY RUN — nothing written. Re-run with APPLY=true to apply.",
    );
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("[flavours] failed:", error.message);
    process.exit(1);
  }
})();
