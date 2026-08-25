/* Collapse the till catalogue and the web catalogue onto one Product row each.
 *
 * The model already says a listing never carries stock — it points at a Product
 * and that Product's `quantity` is the only number. The reason the two sides
 * drift is that the same physical item currently has two Product rows: a
 * barcoded till row and an unbarcoded row the web import made. This joins them.
 *
 * For every sellable row on a LIVE listing:
 *   - if it confidently matches a till product, re-point the listing at it;
 *   - otherwise create one online-only product (no barcode, ever) and point at
 *     that.
 * Then delete every product no listing and no financial record still needs.
 *
 * Matching is deliberately timid. A wrong MATCH sells the customer one thing
 * and takes the stock off another; a wrong NEW only leaves a duplicate row that
 * can be merged later. So anything short of near-certain becomes NEW, and the
 * near-misses are written out for a human to merge afterwards.
 *
 * Dry run by default. --apply to write. --db <name> to run against a copy.
 */
const fs = require("fs");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");

const BACKEND = process.argv[2];
const CSV = process.argv[3];
const APPLY = process.argv.includes("--apply");
const dbFlag = process.argv.indexOf("--db");
const TARGET_DB = dbFlag > -1 ? process.argv[dbFlag + 1] : null;
const outFlag = process.argv.indexOf("--out");
const OUT = outFlag > -1 ? process.argv[outFlag + 1] : null;
require("dotenv").config({ path: path.join(BACKEND, ".env") });

const oid = (v) => new ObjectId(String(v));

/* ---------- csv ---------- */
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

/* ---------- name handling ---------- */
// Web names arrive as "IVG SMART 5500| Rechargeable vape kit — Fizzy Cherry" or
// "CUBA BLUEBERRY ( BLACK )". Strip the scaffolding before comparing.
const NOISE = /\b(in premium (special )?flavours?|premium flavours?|high quality flavours?|flavours?|disposable vapes?|nicotine pouches?|rechargeable vape kit|vape kit|vapes?)\b/gi;

const clean = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[|—–()[\]/,._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const squash = (s) => clean(s).replace(/[^a-z0-9]/g, "");
const wordKey = (s) =>
  [...new Set(clean(s).replace(NOISE, " ").split(" ").filter(Boolean))].sort().join(" ");

const bigrams = (s) => {
  const m = new Map();
  for (let i = 0; i < s.length - 1; i += 1) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) || 0) + 1);
  }
  return m;
};
const dice = (a, b) => {
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a), B = bigrams(b);
  let shared = 0;
  for (const [g, n] of A) if (B.has(g)) shared += Math.min(n, B.get(g));
  const tot = [...A.values()].reduce((x, y) => x + y, 0) + [...B.values()].reduce((x, y) => x + y, 0);
  return (2 * shared) / tot;
};

// A till name for an online-only row: the listing's line without the marketing
// words, plus the flavour. "IVG SMART 5500 VAPES" + "Fizzy Cherry".
const tillName = (line, label) => {
  const base = String(line || "").replace(NOISE, " ").replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
  const flavour = String(label || "").trim();
  if (!flavour) return base || String(line || "").trim();
  if (squash(base).includes(squash(flavour))) return base;
  return `${base} ${flavour}`.replace(/\s+/g, " ").trim();
};

const MATCH_MIN = 0.9;   // below this we create a new row instead of guessing
const AMBIGUOUS_GAP = 0.03;

(async () => {
  const raw = fs.readFileSync(CSV, "utf8").replace(/^﻿/, "");
  const rows = parseCsv(raw);
  const header = rows.shift().map((h) => h.trim());
  const at = (r, n) => (r[header.indexOf(n)] || "").trim();
  const csv = rows.map((r) => ({ name: at(r, "Product name"), barcode: at(r, "Barcode") }));
  const csvNames = new Set(csv.map((c) => c.name));

  const client = new MongoClient(process.env.MONGODB_URL);
  await client.connect();
  const db = TARGET_DB ? client.db(TARGET_DB) : client.db();
  console.log(`database: ${db.databaseName}${APPLY ? "  [APPLY]" : "  [dry run]"}`);

  const Products = db.collection("products");
  const Categories = db.collection("categories");
  const Listings = db.collection("onlinelistings");

  /* ---------- index the till catalogue (CSV rows that are in the db) ---------- */
  const tillProducts = await Products.find({
    $or: [{ barcode: { $exists: true, $nin: [null, ""] } }, { name: { $in: [...csvNames] } }],
  }).project({ name: 1, barcode: 1 }).toArray();

  const byBarcode = new Map();
  const bySquash = new Map();
  const byWord = new Map();
  const candidates = [];
  for (const p of tillProducts) {
    if (p.barcode) byBarcode.set(p.barcode, p);
    const s = squash(p.name);
    if (!bySquash.has(s)) bySquash.set(s, p);
    const w = wordKey(p.name);
    if (!byWord.has(w)) byWord.set(w, p);
    candidates.push({ p, key: squash(p.name) });
  }
  console.log("till products indexed:", tillProducts.length);

  /* ---------- walk the live listings ---------- */
  const live = await Listings.find({ listed: true }).toArray();
  const productIds = new Set();
  for (const l of live) {
    if (l.product) productIds.add(String(l.product));
    for (const v of l.variants || []) if (v.product) productIds.add(String(v.product));
  }
  const webProducts = new Map(
    (await Products.find({ _id: { $in: [...productIds].map(oid) } })
      .project({ name: 1, barcode: 1, Price: 1, quantity: 1 })
      .toArray()).map((p) => [String(p._id), p]),
  );

  const onlineCats = new Map(
    (await db.collection("onlinecategories").find({}).project({ name: 1 }).toArray())
      .map((c) => [String(c._id), c.name]),
  );

  const decide = (webProduct, listingLine, label) => {
    if (!webProduct) return null;
    if (webProduct.barcode && byBarcode.has(webProduct.barcode)) {
      return { how: "barcode", hit: byBarcode.get(webProduct.barcode), score: 1 };
    }
    // Try the web row's own name and the listing+flavour reading of it.
    const tries = [webProduct.name, tillName(listingLine, label)];
    for (const t of tries) {
      const s = squash(t);
      if (bySquash.has(s)) return { how: "name", hit: bySquash.get(s), score: 1 };
    }
    for (const t of tries) {
      const w = wordKey(t);
      if (w && byWord.has(w)) return { how: "words", hit: byWord.get(w), score: 1 };
    }
    let best = null, bestScore = 0, second = 0;
    for (const t of tries) {
      const key = squash(t);
      for (const c of candidates) {
        const sc = dice(key, c.key);
        if (sc > bestScore) { second = bestScore; bestScore = sc; best = c.p; }
        else if (sc > second) second = sc;
      }
    }
    if (best && bestScore >= MATCH_MIN && bestScore - second >= AMBIGUOUS_GAP) {
      return { how: "fuzzy", hit: best, score: bestScore };
    }
    return { how: "none", near: best, score: bestScore };
  };

  const plan = [];      // one entry per sellable row
  const stats = { barcode: 0, name: 0, words: 0, fuzzy: 0, neu: 0 };

  for (const l of live) {
    const line = l.webName || webProducts.get(String(l.product))?.name || l.slug;
    const catName = onlineCats.get(String(l.category)) || "Online";
    const variants = (l.variants || []).filter((v) => v.product);
    const targets = variants.length
      ? variants.map((v) => ({ kind: "variant", label: v.label, productId: String(v.product), variant: v }))
      : [{ kind: "parent", label: "", productId: String(l.product), variant: null }];

    for (const t of targets) {
      const web = webProducts.get(t.productId);
      const d = decide(web, line, t.label);
      const price = t.variant?.priceOverride ?? l.priceOverride ?? web?.Price ?? 0;
      if (d && d.how !== "none") {
        stats[d.how] += 1;
        plan.push({
          listing: l.slug, line, label: t.label, kind: t.kind,
          from: t.productId, fromName: web?.name || "",
          to: String(d.hit._id), toName: d.hit.name,
          how: d.how, score: d.score, action: "MATCH",
        });
      } else {
        stats.neu += 1;
        plan.push({
          listing: l.slug, line, label: t.label, kind: t.kind,
          from: t.productId, fromName: web?.name || "",
          newName: tillName(line, t.label),
          category: `ONLINE — ${catName}`,
          price: Number(price) || 0,
          action: "NEW",
          nearest: d?.near?.name || "", score: d?.score || 0,
        });
      }
    }
  }

  console.log("\nlive sellable rows :", plan.length);
  console.log("   MATCH by barcode:", stats.barcode);
  console.log("   MATCH by name   :", stats.name);
  console.log("   MATCH by words  :", stats.words);
  console.log("   MATCH fuzzy>=.9 :", stats.fuzzy);
  console.log("   NEW online-only :", stats.neu);

  const newCats = [...new Set(plan.filter((p) => p.action === "NEW").map((p) => p.category))];
  console.log("\nonline categories to create:", newCats.length);
  newCats.slice(0, 20).forEach((c) => console.log("   ", c));

  // Near-misses worth a human merge later: created NEW but something looked close.
  const review = plan.filter((p) => p.action === "NEW" && p.score >= 0.75);
  console.log("\npossible duplicates to review later:", review.length);

  if (OUT) {
    const esc = (v) => {
      const s = v === undefined || v === null ? "" : String(v);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cols = ["action", "listing", "line", "label", "fromName", "toName", "newName", "category", "price", "how", "score", "nearest"];
    const lines = [cols.join(",")];
    for (const p of plan) lines.push(cols.map((c) => esc(p[c])).join(","));
    fs.writeFileSync(OUT, "﻿" + lines.join("\r\n") + "\r\n", "utf8");
    console.log("plan written:", OUT);
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written.");
    await client.close();
    return;
  }

  /* ---------- write ---------- */
  const now = new Date();

  // categories for the online-only rows, tagged in the name so the tag shows up
  // everywhere in the IMS without a UI change
  const catId = new Map();
  for (const name of newCats) {
    const found = await Categories.findOne({ name });
    if (found) { catId.set(name, found._id); continue; }
    const res = await Categories.insertOne({
      name, description: "Online store category", system: false,
      createdAt: now, updatedAt: now, __v: 0,
    });
    catId.set(name, res.insertedId);
  }
  console.log("categories ensured:", catId.size);

  // create the online-only products
  const newRows = plan.filter((p) => p.action === "NEW");
  const created = new Map();
  if (newRows.length) {
    const docs = newRows.map((p) => ({
      name: p.newName,
      Desciption: "",
      Category: catId.get(p.category) || null,
      Price: Number(p.price) || 0,
      costPrice: 0,
      quantity: 20,
      lowStockThreshold: 10,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    }));
    const res = await Products.insertMany(docs, { ordered: true });
    newRows.forEach((p, i) => created.set(`${p.listing}::${p.kind}::${p.label}`, res.insertedIds[i]));
    console.log("online-only products created:", res.insertedCount);
  }

  // re-point every live listing
  let repointedParents = 0, repointedVariants = 0;
  for (const l of live) {
    const mine = plan.filter((p) => p.listing === l.slug);
    const set = {};
    let variants = l.variants ? l.variants.map((v) => ({ ...v })) : [];
    for (const p of mine) {
      const target = p.action === "MATCH" ? oid(p.to) : created.get(`${p.listing}::${p.kind}::${p.label}`);
      if (!target) continue;
      if (p.kind === "parent") {
        set.product = target;
        repointedParents += 1;
      } else {
        const idx = variants.findIndex((v) => String(v.product) === p.from && v.label === p.label);
        if (idx > -1) { variants[idx].product = target; repointedVariants += 1; }
      }
    }
    // A listing whose variants moved still points its own `product` at the old
    // placeholder; aim it at the first variant so nothing dangles.
    if (variants.length && !set.product) {
      const first = variants[0]?.product;
      if (first) set.product = oid(first);
    }
    if (variants.length) set.variants = variants;
    if (Object.keys(set).length) {
      set.updatedAt = now;
      await Listings.updateOne({ _id: l._id }, { $set: set });
    }
  }
  console.log("listing parents re-pointed :", repointedParents);
  console.log("variant rows re-pointed    :", repointedVariants);

  /* ---------- delete what nothing needs any more ---------- */
  const keep = new Set();
  for (const l of await Listings.find({}).toArray()) {
    if (l.product) keep.add(String(l.product));
    for (const v of l.variants || []) if (v.product) keep.add(String(v.product));
  }
  for (const s of await db.collection("sales").find({}).toArray())
    for (const i of s.items || []) if (i.product) keep.add(String(i.product));
  for (const r of await db.collection("receipts").find({}).toArray()) {
    if (r.product) keep.add(String(r.product));
    for (const i of r.items || []) if (i.product) keep.add(String(i.product));
  }
  for (const o of await db.collection("onlineorders").find({}).toArray())
    for (const i of o.items || []) if (i.product) keep.add(String(i.product));
  for (const d of await db.collection("deals").find({}).toArray())
    if (d.product) keep.add(String(d.product));
  // everything the CSV put there stays: that is the till catalogue
  for (const p of await Products.find({ name: { $in: [...csvNames] } }).project({ _id: 1 }).toArray())
    keep.add(String(p._id));
  for (const id of created.values()) keep.add(String(id));

  const keepIds = [...keep].map(oid);
  const doomed = await Products.find({ _id: { $nin: keepIds } }).project({ _id: 1 }).toArray();
  const doomedIds = doomed.map((d) => d._id);
  await db.collection("reorders").deleteMany({ product: { $in: doomedIds } });
  await db.collection("stocktranscations").deleteMany({ product: { $in: doomedIds } });
  const del = await Products.deleteMany({ _id: { $in: doomedIds } });
  console.log("stale web products deleted :", del.deletedCount);

  /* ---------- prune categories to what is actually used ---------- */
  const used = new Set(
    (await Products.distinct("Category")).filter(Boolean).map(String),
  );
  const allCats = await Categories.find({}).project({ name: 1 }).toArray();
  const unused = allCats.filter((c) => !used.has(String(c._id)));
  const delCats = await Categories.deleteMany({ _id: { $in: unused.map((c) => c._id) } });
  console.log("empty categories removed   :", delCats.deletedCount);
  console.log("categories left            :", allCats.length - delCats.deletedCount);
  console.log("products now               :", await Products.countDocuments({}));

  await client.close();
})().catch(async (e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
