/* Read-only check of a merged database: does every listing still resolve, is the
 * catalogue composed of what we expect, and does one product row genuinely back
 * both channels? */
const fs = require("fs");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");

const BACKEND = process.argv[2];
const CSV = process.argv[3];
const dbFlag = process.argv.indexOf("--db");
const TARGET_DB = dbFlag > -1 ? process.argv[dbFlag + 1] : null;
require("dotenv").config({ path: path.join(BACKEND, ".env") });

const oid = (v) => new ObjectId(String(v));

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ""));
}

(async () => {
  const raw = fs.readFileSync(CSV, "utf8").replace(/^﻿/, "");
  const rows = parseCsv(raw);
  const header = rows.shift().map((h) => h.trim());
  const at = (r, n) => (r[header.indexOf(n)] || "").trim();
  const csvNames = new Set(rows.map((r) => at(r, "Product name")));
  const csvBarcodes = rows.map((r) => at(r, "Barcode")).filter(Boolean);

  const client = new MongoClient(process.env.MONGODB_URL);
  await client.connect();
  const db = TARGET_DB ? client.db(TARGET_DB) : client.db();
  console.log("database:", db.databaseName, "\n");

  const Products = db.collection("products");
  const Listings = db.collection("onlinelistings");
  const Categories = db.collection("categories");

  /* ---- integrity ---- */
  const listings = await Listings.find({}).toArray();
  const ids = new Set();
  for (const l of listings) {
    if (l.product) ids.add(String(l.product));
    for (const v of l.variants || []) if (v.product) ids.add(String(v.product));
  }
  const present = new Set(
    (await Products.find({ _id: { $in: [...ids].map(oid) } }).project({ _id: 1 }).toArray())
      .map((p) => String(p._id)),
  );
  let badParent = 0, badVariant = 0, liveRows = 0;
  for (const l of listings) {
    if (l.product && !present.has(String(l.product))) badParent += 1;
    for (const v of l.variants || []) {
      if (v.product && !present.has(String(v.product))) badVariant += 1;
      if (l.listed) liveRows += 1;
    }
  }
  console.log("listings                :", listings.length,
    `(live ${listings.filter((l) => l.listed).length}, parked ${listings.filter((l) => !l.listed).length})`);
  console.log("live variant rows       :", liveRows);
  console.log("BROKEN parent refs      :", badParent);
  console.log("BROKEN variant refs     :", badVariant);

  /* ---- composition ---- */
  const total = await Products.countDocuments({});
  const inCsv = await Products.countDocuments({ name: { $in: [...csvNames] } });
  const withBarcode = await Products.countDocuments({ barcode: { $exists: true, $nin: [null, ""] } });
  const onlineCats = await Categories.find({ name: /^ONLINE — / }).project({ _id: 1, name: 1 }).toArray();
  const onlineOnly = await Products.countDocuments({ Category: { $in: onlineCats.map((c) => c._id) } });
  console.log("\nproducts total          :", total);
  console.log("   matching a CSV name  :", inCsv);
  console.log("   with a barcode       :", withBarcode);
  console.log("   in ONLINE categories :", onlineOnly);
  console.log("   remainder (parked/history):", total - inCsv - onlineOnly);

  const dupes = await Products.aggregate([
    { $match: { barcode: { $exists: true, $nin: [null, ""] } } },
    { $group: { _id: "$barcode", n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();
  const missing = csvBarcodes.filter(
    async () => false,
  );
  const found = new Set(
    (await Products.find({ barcode: { $in: csvBarcodes } }).project({ barcode: 1 }).toArray())
      .map((p) => p.barcode),
  );
  console.log("   duplicate barcodes   :", dupes.length);
  console.log("   CSV barcodes present :", found.size, "/", csvBarcodes.length);

  /* ---- categories ---- */
  const cats = await Categories.find({}).project({ name: 1 }).toArray();
  const perCat = await Products.aggregate([
    { $group: { _id: "$Category", n: { $sum: 1 } } }, { $sort: { n: -1 } },
  ]).toArray();
  const nameOf = new Map(cats.map((c) => [String(c._id), c.name]));
  console.log("\ncategories:", cats.length);
  for (const r of perCat) {
    console.log(`   ${String(r.n).padStart(5)}  ${r._id ? nameOf.get(String(r._id)) || "??" : "(none)"}`);
  }

  /* ---- the point of the whole exercise: one row, both channels ---- */
  console.log("\nshared rows (a barcoded till product that a live listing sells):");
  const liveIds = new Set();
  for (const l of listings.filter((x) => x.listed)) {
    if (l.product) liveIds.add(String(l.product));
    for (const v of l.variants || []) if (v.product) liveIds.add(String(v.product));
  }
  const shared = await Products.find({
    _id: { $in: [...liveIds].map(oid) },
    barcode: { $exists: true, $nin: [null, ""] },
  }).project({ name: 1, barcode: 1, Price: 1, quantity: 1 }).limit(8).toArray();
  const sharedCount = await Products.countDocuments({
    _id: { $in: [...liveIds].map(oid) },
    barcode: { $exists: true, $nin: [null, ""] },
  });
  console.log("   count:", sharedCount);
  for (const s of shared) {
    console.log(`   ${s.barcode.padEnd(15)} ${s.name} | till EUR ${s.Price} | stock ${s.quantity}`);
  }

  await client.close();
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
