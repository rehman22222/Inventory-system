/* Collapse the leftover categories into one "ONLINE — Parked".
 *
 * After the catalogue merge the till's category list still carried 18 legacy
 * categories — SNUS, VAPES/PODS, "… Ireland" duplicates and so on. Nothing is
 * wrong with the products in them; they are simply the rows held open by the 66
 * PARKED listings, plus a handful named only on old receipts. Mapping each to
 * its listing's own online category would invent ten more categories, so the
 * parked ones all go to a single honestly-named bucket instead.
 *
 * The rule that must not break: nothing a LIVE listing sells is ever parked.
 * A few live products are still sitting in a legacy category; those move to the
 * ONLINE category their own listing already uses, so the shop's live range ends
 * up together. If one has no such category yet it is left untouched and
 * reported rather than guessed at.
 *
 * Dry run by default. --apply to write.
 */
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

// Resolve first: `node scripts/x.js .` would otherwise make require("models/…")
// look like a package name rather than a path.
const BACKEND = path.resolve(process.argv[2] || ".");
const CSV = process.argv[3];
const APPLY = process.argv.includes("--apply");
require("dotenv").config({ path: path.join(BACKEND, ".env") });

const Product = require(path.join(BACKEND, "models", "Productmodel"));
const Category = require(path.join(BACKEND, "models", " Categorymodel"));
const OnlineListing = require(path.join(BACKEND, "models", "OnlineListingmodel"));
const OnlineCategory = require(path.join(BACKEND, "models", "OnlineCategorymodel"));

const PARKED = "ONLINE — Parked";

(async () => {
  await mongoose.connect(process.env.MONGODB_URL);

  const raw = fs.readFileSync(CSV, "utf8").replace(/^﻿/, "");
  const sheetCats = new Set(
    raw
      .split(/\r?\n/)
      .slice(1)
      .map((l) => (l.split(",")[2] || "").trim().toLowerCase())
      .filter(Boolean),
  );

  const cats = await Category.find({}).select("name").lean();
  const isKeeper = (c) =>
    sheetCats.has((c.name || "").trim().toLowerCase()) || /^ONLINE — /.test(c.name || "");
  const extra = cats.filter((c) => !isKeeper(c));
  const catIdByName = new Map(cats.map((c) => [c.name, c._id]));

  console.log("categories now      :", cats.length);
  console.log(
    "   sheet categories :",
    cats.filter((c) => sheetCats.has((c.name || "").trim().toLowerCase())).length,
  );
  console.log("   ONLINE — ...     :", cats.filter((c) => /^ONLINE — /.test(c.name || "")).length);
  console.log("   leftover         :", extra.length);
  if (!extra.length) {
    console.log("nothing to do.");
    await mongoose.disconnect();
    return;
  }

  const live = await OnlineListing.find({ listed: true })
    .select("product variants.product category")
    .lean();
  const onlineCatName = new Map(
    (await OnlineCategory.find({}).select("name").lean()).map((c) => [String(c._id), c.name]),
  );
  const liveHolder = new Map();
  for (const l of live) {
    for (const id of [l.product, ...(l.variants || []).map((v) => v.product)].filter(Boolean)) {
      if (!liveHolder.has(String(id))) liveHolder.set(String(id), l);
    }
  }

  const extraIds = extra.map((c) => c._id);
  const rows = await Product.find({ Category: { $in: extraIds } })
    .select("name barcode Category")
    .lean();

  const onLive = rows.filter((r) => liveHolder.has(String(r._id)));
  const parking = rows.filter((r) => !liveHolder.has(String(r._id)));

  const rehome = [];
  const unplaceable = [];
  for (const r of onLive) {
    const l = liveHolder.get(String(r._id));
    const target = `ONLINE — ${onlineCatName.get(String(l.category)) || "Online"}`;
    if (catIdByName.has(target)) rehome.push({ row: r, target });
    else unplaceable.push({ row: r, target });
  }

  console.log("\nproducts in leftover categories:", rows.length);
  console.log("   parking                     :", parking.length);
  console.log("   with a barcode (would hit the till):", parking.filter((r) => r.barcode).length);
  console.log("   on a LIVE listing, re-homed :", rehome.length);
  const byTarget = new Map();
  for (const x of rehome) byTarget.set(x.target, (byTarget.get(x.target) || 0) + 1);
  for (const [t, n] of byTarget) console.log(`      ${String(n).padStart(4)}  -> ${t}`);
  if (unplaceable.length) {
    console.log("   LIVE but no matching ONLINE category — LEFT ALONE:", unplaceable.length);
    for (const u of unplaceable) console.log(`      ${u.row.name}  (wanted ${u.target})`);
  }

  console.log("\nper leftover category (parking / live):");
  for (const c of extra) {
    const p = parking.filter((r) => String(r.Category) === String(c._id)).length;
    const l = onLive.filter((r) => String(r.Category) === String(c._id)).length;
    console.log(`   ${String(p).padStart(4)} / ${String(l).padStart(2)}   ${c.name}`);
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply.");
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  let parked = await Category.findOne({ name: PARKED });
  if (!parked) {
    parked = await Category.create({
      name: PARKED,
      description: "Online products whose listing is currently hidden",
      system: false,
      createdAt: now,
      updatedAt: now,
    });
    console.log("\ncreated category:", PARKED);
  }

  const moved = await Product.updateMany(
    { _id: { $in: parking.map((r) => r._id) } },
    { $set: { Category: parked._id, updatedAt: now } },
  );
  console.log("products parked:", moved.modifiedCount);

  for (const { row, target } of rehome) {
    await Product.updateOne(
      { _id: row._id },
      { $set: { Category: catIdByName.get(target), updatedAt: now } },
    );
  }
  console.log("live products re-homed:", rehome.length);

  // Only categories that are genuinely empty now go — never one still in use.
  const stillUsed = new Set(
    (await Product.distinct("Category", { Category: { $in: extraIds } })).map(String),
  );
  const emptied = extra.filter((c) => !stillUsed.has(String(c._id)));
  const del = await Category.deleteMany({ _id: { $in: emptied.map((c) => c._id) } });
  console.log("empty categories removed:", del.deletedCount);
  const kept = extra.filter((c) => stillUsed.has(String(c._id)));
  if (kept.length) console.log("kept (still hold products):", kept.map((c) => c.name).join(", "));
  console.log("categories left:", await Category.countDocuments({}));

  await mongoose.disconnect();
})().catch(async (e) => {
  console.error("FAILED:", e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
