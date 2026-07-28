/*
 * Update inventory prices for ONLINE-STORE products from the shop's price list.
 *
 * Only touches products that appear on the online store (listings + variants) —
 * never the thousands of unrelated shop items. Matches by longest normalised
 * name prefix, so the most specific rule wins.
 *
 *   node scripts/updateOnlinePrices.js            # DRY RUN — writes a CSV, changes nothing
 *   APPLY=true node scripts/updateOnlinePrices.js # actually update Product.Price
 *
 * NOTE: Product.Price is shared with the POS, so this changes the shelf price
 * too. Review the CSV before running with APPLY=true.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const OnlineListing = require("../models/OnlineListingmodel");
const Product = require("../models/Productmodel");

const APPLY = process.env.APPLY === "true";
const OUT = path.join(__dirname, "..", "..", "online-price-update-preview.csv");

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Clear single-unit prices from the price list. Deals ("3 for 18"), unknown
// prices ("?") and ambiguous multi-size / conflicting entries are deliberately
// left out — those must be set by hand.
const RULES = [
  ["Hayati Pro Max Nic Salt", "hayatipromaxnicsalt", 7],
  ["Hayati Pro Mini 600 Puffs", "hayatipromini600puffsdisposablevapes", 7],
  ["IVG 6000 Nic Salts", "ivg6000nicsalts", 7],
  ["IVG Intense Salts 20MG", "ivgintensesalts20mg", 7],
  ["IVG 12 Pro Vape Kit 10K Puff", "ivg12provapekit10kpuff", 25],
  ["IVG Pro 12 Refill Pack", "ivgpro12refillpack", 15],
  ["IVG Smart 5500 vape kit", "ivgsmart5500", 20],
  ["IVG Smart Max 12 10K Puffs", "ivgsmartmax1210kpuffs", 25],
  ["IVG Smart Max Refill Pod", "ivgsmartmaxrefillpod", 15],
  ["ElfLIQ Elf Bar E-Liquid", "elfliqelfbare", 7],
  ["Elfbar 600 Disposable Pod", "elfbar600disposablepod", 7],
  ["Elfbar AF5000 Disposable Vape Kit", "elfbaraf5000disposablevapekit", 18],
  ["Elux Legend Vapes", "eluxlegend", 15],
  ["Cuba Black Nicotine Pouches", "cubablacknicotinepouches", 7],
  ["Cuba White Nicotine Pouches", "cubawhitenicotinepouches", 7],
  ["Goat Nicotine Pouches", "goatnicotinepouches", 8],
  ["Rascal Nicotine Pouches", "rascalnicotinepouches", 7],
  ["Iceburg Nicotine Pouches", "iceburgnicotinepouches", 7],
  ["Nordic Spirit", "nordicspirit", 8],
  ["Zyn Nicotine Pouch", "zynnicotinepouch", 8],
  ["Rebel Nicotine Pouch", "rebelnicotinepouch", 7],
  ["Killa Pouch", "killapouch", 7],
  ["Pablo", "pablo", 7],
  ["Lost Mary BM6000 Refillable Kit", "lostmarybm6000refillablekit", 13],
  ["Lost Mary TAPPO 2ml Prefilled Pod", "lostmarytappo", 10],
  ["Lost Mary Nera 30K", "lostmarynera30k", 30],
  ["Aspire Gotek S Pod Kit", "aspiregoteks", 15],
  ["Aspire Minican+ Pod Vape", "aspireminican", 15],
  ["Aspire Pixo Pod Kit", "aspirepixopodkit", 15],
  ["Vaporesso Argus G2 Mini", "vaporessoargusg2mini", 29.99],
  ["Vaporesso Xros 4 Mini", "vaporessoxros4mini", 29.99],
  ["Vaporesso Xros Mini", "vaporessoxrosmini", 29.99],
  ["Vaporesso Xros Pro", "vaporessoxrospro", 39.99],
  ["Aztec CBD Gummies", "azteccbdgummies", 29],
  ["Haze CBD Sleep Gummies", "hazecbdsleepgummies", 39.99],
  ["47% THX Pre-Rolled Joints", "47thx", 12],
  ["Rollz Pre-Rolled Joints", "rollz", 12],
];
// Longest key first so the most specific rule wins (e.g. "…refillpod" beats "ivg…").
RULES.sort((a, b) => b[1].length - a[1].length);

const money = (v) => Math.round(Number(v || 0) * 100) / 100;
const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL || process.env.MONGODB_URI);

    // Distinct products that are on the online store.
    const listings = await OnlineListing.find({})
      .populate("product", "name Price")
      .populate("variants.product", "name Price")
      .lean();
    const products = new Map();
    for (const l of listings) {
      if (l.product) products.set(String(l.product._id), l.product);
      for (const v of l.variants || [])
        if (v.product) products.set(String(v.product._id), v.product);
    }

    const rows = [];
    let changed = 0;
    let unmatched = 0;
    for (const p of products.values()) {
      const key = norm(p.name);
      const rule = RULES.find(([, k]) => key.startsWith(k));
      if (!rule) {
        unmatched += 1;
        continue;
      }
      const [label, , newPrice] = rule;
      const oldPrice = money(p.Price);
      if (oldPrice === money(newPrice)) continue;
      rows.push({ id: p._id, name: p.name, oldPrice, newPrice: money(newPrice), label });
      changed += 1;
    }

    rows.sort((a, b) => a.name.localeCompare(b.name));
    const csv = [
      ["Product", "Old €", "New €", "Matched rule"].map(csvCell).join(","),
      ...rows.map((r) =>
        [r.name, r.oldPrice, r.newPrice, r.label].map(csvCell).join(","),
      ),
    ].join("\r\n");
    fs.writeFileSync(OUT, csv + "\r\n", "utf8");

    console.log(`[prices] online-store products scanned : ${products.size}`);
    console.log(`[prices] products with a price change  : ${changed}`);
    console.log(`[prices] products matching no rule      : ${unmatched}`);
    console.log(`[prices] preview written                : ${OUT}`);
    console.log("[prices] biggest changes:");
    [...rows]
      .sort((a, b) => Math.abs(b.newPrice - b.oldPrice) - Math.abs(a.newPrice - a.oldPrice))
      .slice(0, 12)
      .forEach((r) => console.log(`   ${r.oldPrice} -> ${r.newPrice}   ${r.name}`));

    if (APPLY) {
      for (const r of rows) {
        await Product.updateOne({ _id: r.id }, { $set: { Price: r.newPrice } });
      }
      console.log(`\n[prices] APPLIED ${rows.length} price updates.`);
    } else {
      console.log("\n[prices] DRY RUN — nothing changed. Review the CSV, then run with APPLY=true.");
    }
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("[prices] failed:", error.message);
    process.exit(1);
  }
})();
