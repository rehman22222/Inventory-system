/*
 * Re-host every external (e.g. cdn.shopify.com) image onto our own Cloudinary,
 * so the shop no longer depends on the old Shopify store's CDN and images load
 * from Cloudinary's fast, optimised CDN instead.
 *
 * Covers: inventory Product images, OnlineListing galleries + variant (flavour)
 * images, OnlineCategory images, and OnlineHeroSlide images.
 *
 * Safe + idempotent: only URLs that are NOT already on Cloudinary are re-hosted,
 * each unique image is uploaded once (deduplicated), and a failed upload leaves
 * the original URL untouched. Re-running after everything is migrated is a no-op.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const cloudinary = require("../libs/Cloundinary");
const Product = require("../models/Productmodel");
const OnlineListing = require("../models/OnlineListingmodel");
const OnlineCategory = require("../models/OnlineCategorymodel");
const OnlineHeroSlide = require("../models/OnlineHeroSlidemodel");

const FOLDER = "online_store";
const CONCURRENCY = 5;

const needsRehost = (url) =>
  typeof url === "string" &&
  /^https?:\/\//i.test(url) &&
  !/res\.cloudinary\.com/i.test(url);

(async () => {
  try {
    if (
      !(process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME) ||
      !(process.env.CLOUDINARY_API_KEY || process.env.API_KEY)
    ) {
      throw new Error("Cloudinary is not configured (set CLOUDINARY_* in .env)");
    }
    await mongoose.connect(process.env.MONGODB_URL || process.env.MONGODB_URI);

    const [products, listings, categories, slides] = await Promise.all([
      Product.find({ "image.url": { $exists: true, $ne: "" } }),
      OnlineListing.find({}),
      OnlineCategory.find({ image: { $ne: "" } }),
      OnlineHeroSlide.find({ image: { $ne: "" } }),
    ]);

    // Phase 1 — collect every unique external URL across all collections.
    const urls = new Set();
    const add = (u) => {
      if (needsRehost(u)) urls.add(u);
    };
    products.forEach((p) => add(p.image?.url));
    listings.forEach((l) => {
      (l.gallery || []).forEach((g) => add(g.url));
      (l.variants || []).forEach((v) => add(v.image));
    });
    categories.forEach((c) => add(c.image));
    slides.forEach((s) => add(s.image));

    const unique = [...urls];
    console.log(
      `[migrate] ${unique.length} unique external images to re-host onto Cloudinary…`,
    );

    // Phase 2 — upload each unique image once, with light concurrency.
    const map = new Map();
    let done = 0;
    let failed = 0;
    const worker = async (list) => {
      for (const url of list) {
        try {
          const r = await cloudinary.uploader.upload(url, { folder: FOLDER });
          map.set(url, { url: r.secure_url, publicId: r.public_id });
        } catch (error) {
          failed += 1;
          console.warn("  ! upload failed:", error.message, "-", url.slice(0, 70));
        }
        done += 1;
        if (done % 25 === 0) console.log(`  …${done}/${unique.length}`);
      }
    };
    const chunks = Array.from({ length: CONCURRENCY }, () => []);
    unique.forEach((u, i) => chunks[i % CONCURRENCY].push(u));
    await Promise.all(chunks.map(worker));
    console.log(`[migrate] uploaded ${map.size}, failed ${failed}`);

    // Phase 3 — rewrite the stored URLs to their Cloudinary equivalents.
    let pc = 0;
    let lc = 0;
    let cc = 0;
    let sc = 0;

    for (const p of products) {
      const r = map.get(p.image?.url);
      if (r) {
        p.image = { url: r.url, publicId: r.publicId };
        await p.save();
        pc += 1;
      }
    }
    for (const l of listings) {
      let changed = false;
      (l.gallery || []).forEach((g) => {
        const r = map.get(g.url);
        if (r) {
          g.url = r.url;
          g.publicId = r.publicId;
          changed = true;
        }
      });
      (l.variants || []).forEach((v) => {
        const r = map.get(v.image);
        if (r) {
          v.image = r.url;
          changed = true;
        }
      });
      if (changed) {
        await l.save();
        lc += 1;
      }
    }
    for (const c of categories) {
      const r = map.get(c.image);
      if (r) {
        c.image = r.url;
        await c.save();
        cc += 1;
      }
    }
    for (const s of slides) {
      const r = map.get(s.image);
      if (r) {
        s.image = r.url;
        await s.save();
        sc += 1;
      }
    }

    console.log("──────────────────────────────────────────────");
    console.log(
      `[migrate] rewritten — products:${pc} listings:${lc} categories:${cc} heroSlides:${sc}`,
    );
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("[migrate] failed:", error.message);
    process.exit(1);
  }
})();
