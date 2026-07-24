/* Import supplier invoice stock from the client's merged workbook.
 *
 * Safety:
 * - dry-run by default; pass --apply to write;
 * - EUR rows only unless Store.exchangeRates contains the invoice currency;
 * - case quantities are expanded into retail units;
 * - new products are created only when the invoice provides an explicit RRP;
 * - fuzzy name matches are never written automatically: every non-exact match
 *   below is an explicitly reviewed alias;
 * - the whole import is one MongoDB transaction;
 * - every changed document is copied to invoiceImportBackups first;
 * - the workbook SHA-256 makes the import idempotent.
 */
require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const mongoose = require("mongoose");

const Product = require("../models/Productmodel");
const Category = require("../models/ Categorymodel");
const Supplier = require("../models/Suppliermodel");
const Store = require("../models/Storemodel");
const StockTransaction = require("../models/StockTranscationmodel");

const APPLY = process.argv.includes("--apply");
const inputArg = process.argv.find((arg) => arg.toLowerCase().endsWith(".xlsx"));
const INPUT = path.resolve(
  inputArg || "C:/Users/dell/Downloads/Merged file (1).xlsx"
);

const round2 = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizedName = (value) =>
  text(value)
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const canonicalSupplier = (value) => {
  const name = text(value);
  if (/musgrave/i.test(name)) return "Musgrave Marketplace";
  if (/hamilton|3d trading/i.test(name)) return "Hamilton Imports Ltd / 3D Trading";
  if (/o'reilly/i.test(name)) return "O'Reillys Distribution Ltd";
  if (/galaxy cash/i.test(name)) return "Galaxy Cash & Carry";
  return name || "Unknown supplier";
};

const parsePackCount = (value) => {
  const direct = number(value);
  if (direct !== null && Number.isInteger(direct) && direct > 0) return direct;
  const raw = text(value);
  const x = raw.match(/^\s*(\d+)\s*[xX]/);
  if (x) return Number(x[1]);
  const count = raw.match(/^\s*(\d+)\s*(?:CT|COUNT)\b/i);
  if (count) return Number(count[1]);
  return null;
};

// Only obvious spelling/word-order variants belong here. Package-size changes,
// generic names and "closest looking" products are deliberately excluded.
const REVIEWED_ALIASES = new Map(
  Object.entries({
    "ROWNTREES BERRY HEARTS BAG": "ROWNTREE S BERRY HEARTS",
    "SKITTLES CRAZY SOURS GIANTS POUCH": "SKITTLES CRAZY SOURS GIA",
    "SOUR PATCH KIDS COLA BAG": "SOUR PATCH KIDS COLA 130GM",
    "MILLIONS BUBBLEGUM SWEETS": "MILLIONS BUBBLEGUM",
    "MILLIONS BLACKCURRANT SWEETS": "MILLIONS BLACKCURRANT BUZZ",
    "SOUR PATCH KIDS BLUE RASPBERRY SWT": "SOURPATCH KIDS BLUE RASBERRY",
    "GATORADE COOL BLUE": "GATEROIDE COOL BLUE",
    "MIKE IKE COTTON CANDY": "MIKE IKE COTTON CANDY 120G",
    "LAFFY TAFFY ROPE GRAPE": "LAFFY TAFFY GRAPE",
    "LAFFY TAFFY ROPE STRAWBERRY": "LAFFY TAFFY STRAWBRRY",
    "LAFFY TAFFY ROPE BLUE RASPBERRY": "LAFFY TAFFY BLUE RASPEBRRY",
    "TRIDENT WATERMELON": "TRIDENT WATERMELON TWIST",
    "COW TAILS CARAMEL BROWNIE": "CARAMEL BROWNIE COWTALES",
    "AIRHEADS GUM RASPBERRY LEMONADE": "AIRHEADS RASPBERRY LEMONADE",
    "MIKE IKE BLUE RASP TB": "MIKE N IKE BLUE RASPBERRY",
    "MIKE IKE BERRY BLAST": "MIKE N IKE BERRY BLAST",
    "FLUFFY STUFF 1OZ": "FLUFFY STUFF",
    "ARIZONA ORANGEADE": "ARIZONA ORANGE",
    "LAYS PAPRIKA 150G": "LAYS PAPRIKA",
    "LAYS KFC 150G": "LAYS KFC",
    "LAYS SALTED 150G": "LAYS SALTED",
    "SWEDISH FISH 100G": "SWEDISH FISH",
    "HARIBO BERRY CLOUDS 4OZ": "HARIBO BERRY CLOUD",
    "SOUR PATCH GLOWUPS 3 6OZ": "SOUR PATCH GLOW UPS",
    "MOCHI MAPLE PANCAKE180G": "MOCHI MAPE PANCAKE",
    "MOCHI PEANUT BUTTER 180G": "MOCHI PEANUT BUTTER",
    "SOUR PATCH PEACH 3 6OZ": "SOUR PATCH PEACH",
    "NERDS CLUSTER CHERRY LEMONADE 8OZ": "NERDS CHERRY LEMONADE",
    "MIKE IKE ORIGINAL": "MIKE N IKE ORIGINAL FRUITS",
    "MILK DUDS 5OZ": "MILK DUDS",
    "SPRITE LYMONADE": "SPRITE LEMONADE",
    "GATORADE ORANGE": "GATORADE ORANGE591ML",
    "AMOS PEELERZ GUMMY BANANA 120G": "PEELERZ GUMMY BANANA",
    "MOCHI SALTED CARAMEL 180G": "MOCHI SALTED CARAMEL",
    "MOCHI STRAWBERRY CHEESECAKE 180G": "MOCHI STRAWBERRY CHEESECAKE",
    "MONSTER JUICED MANGO LOCOENRO CAM PROMOTION LINE": "MONSTER JUICE MANGO LOCO",
    "MONSTER JUICED MANGO LOCOENRE CAN PROMOTION LINE": "MONSTER JUICE MANGO LOCO",
    "SILK CUT SILVER": "SLIK CUT SILVER",
    "VIT HIT BERRY BOOST": "VIT HIT BERRY",
    "FULFIL CHOC SALTED CARAMEL VIT PR": "FULFIL CHOCOLATE SALTED CARAMEL",
    "NUTELLA BISCUITS 3 PACK": "NUTELLA BISCUITS X3",
    "TAKIS BLUE HEAT": "TAKIS CHIPS BLUE HEAT",
    "TAKIS DRAGON SWEET CHILLI CHIPS": "TAKIS DRAGON SWEET CHILLI",
    "TAKIS SMOKIN BBQ": "TAKIS SMOKING BBQ",
    "NUTELLA GO DIP": "NUTELLA GO",
    "DRS CAN MONSTER PIPELINE PUNCH": "MONSTER PIPELINE PUNCH",
    "DRS CAN MONSTER PACIFIC PUNCH": "MONSTER PACIFIC PUNCH",
    "DRS CAN MONSTER ULTRA STRAWBERRY DREAM": "MONSTER ULTRA STRAWBERRY DREAMS",
    "KINDER SURPRISE T36": "KINDER SURPRRISE",
    "CADBURY OREO BITES BAG": "CADBURY OREO BITES",
    "HARIBO WINE GUMS 1 25 PMP": "HARIBO WINE GUMS",
    "HARIBO HAPPY COLA 1 25 PMP": "HARIBO HAPPY COLA 140GM",
    "M M S COOKIE DOUGH POUCH": "M M S COOKIE DOUGH",
    "RIZLA ULTRA SLIM FILTER TIPS": "RIZLA FILTER ULTRA SLIM",
    "LAYS PIZZA HUT 150G": "LAYS PIZZA HUT",
    "LAYS SOUR CREAM ONION 150G": "LAYS SOUR CREAM ONION",
  }).map(([from, to]) => [normalizedName(from), normalizedName(to)])
);

const categoryNameFor = (name) => {
  const n = normalizedName(name);
  if (
    /MARLBORO|MAYFAIR|SILK CUT|BENSON|HEDGES|VOGUE|CAMEL|L M |AMBER LEAF|RIVERSTONE|TOBACCO|CIGARETTE|CIGAR/.test(
      n
    )
  )
    return "TOBACCO";
  if (
    /WATER|RED BULL|MONSTER|FANTA|COKE|COLA|LUCOZADE|VIT HIT|LIPTON|ARIZONA|GATORADE|DRINK|CAN$|BOTTLE/.test(
      n
    )
  )
    return "DRINKS";
  if (/PRINGLES|TAKIS|LAYS|CHIPS|POPCORN|CRISPS/.test(n)) return "SNACKS";
  if (/BISCUIT|COOKIE|WAFER/.test(n)) return "BISCUITS";
  return "SWEETS & CHOCOLATES";
};

const workbookRows = async (workbook) => {
  const rows = [];

  const push = (row) => {
    row.name = text(row.name);
    row.currency = text(row.currency || "EUR").toUpperCase();
    row.supplier = canonicalSupplier(row.supplier);
    row.invoice = text(row.invoice);
    if (!row.name) row.skip = "missing product name";
    rows.push(row);
  };

  const sheet1 = workbook.getWorksheet("Sheet1");
  sheet1.eachRow((r, row) => {
    if (row === 1) return;
    const supplier = canonicalSupplier(r.getCell(3).value);
    const qty = number(r.getCell(6).value);
    const total = number(r.getCell(2).value);
    push({
      sheet: sheet1.name,
      row,
      name: r.getCell(1).value,
      supplier,
      invoice: r.getCell(4).value,
      date: r.getCell(5).value instanceof Date ? r.getCell(5).value : null,
      currency: "EUR",
      rawQty: qty,
      rawTotal: total,
      mode: /hamilton/i.test(supplier) ? "units" : "case-needs-reference",
    });
  });

  const sheet2 = workbook.getWorksheet("Sheet1 (2)");
  sheet2.eachRow((r, row) => {
    if (row === 1) return;
    push({
      sheet: sheet2.name,
      row,
      name: r.getCell(1).value,
      supplier: "Hamilton Imports Ltd / 3D Trading",
      invoice: r.getCell(3).value,
      date: null,
      currency: r.getCell(4).value || "GBP",
      rawQty: null,
      rawTotal: r.getCell(2).value,
      skip: "no purchased quantity or invoice date in this sheet",
    });
  });

  const sheet3 = workbook.getWorksheet("Sheet1 (3)");
  sheet3.eachRow((r, row) => {
    if (row === 1) return;
    const qty = number(r.getCell(7).value);
    const pack = parsePackCount(r.getCell(6).value);
    const total = number(r.getCell(9).value);
    push({
      sheet: sheet3.name,
      row,
      name: r.getCell(5).value,
      supplier: r.getCell(2).value,
      invoice: r.getCell(1).value,
      date: r.getCell(3).value instanceof Date ? r.getCell(3).value : null,
      currency: "EUR",
      rawQty: qty,
      pack,
      rawTotal: total,
      sku: text(r.getCell(4).value),
      mode: "case",
    });
  });

  const sheet4 = workbook.getWorksheet("Sheet1 (4)");
  sheet4.eachRow((r, row) => {
    if (row === 1) return;
    const qty =
      number(r.getCell(14).value) ??
      number(r.getCell(13).value) ??
      number(r.getCell(12).value);
    const pack = parsePackCount(r.getCell(11).value);
    const total = number(r.getCell(19).value);
    push({
      sheet: sheet4.name,
      row,
      name: r.getCell(9).value,
      supplier: r.getCell(1).value,
      invoice: r.getCell(3).value,
      date: r.getCell(4).value instanceof Date ? r.getCell(4).value : null,
      currency: r.getCell(7).value || "EUR",
      rawQty: qty,
      pack,
      rawTotal: total,
      rrp: number(r.getCell(17).value),
      sku: text(r.getCell(8).value),
      mode: pack ? "case" : "units",
    });
  });

  // A case-only Sheet1 row may borrow its pack count only from another invoice
  // with the exact same product name and an explicit pack.
  const knownPacks = new Map();
  for (const row of rows) {
    if (row.pack) {
      const key = normalizedName(row.name);
      const current = knownPacks.get(key);
      if (!current) knownPacks.set(key, row.pack);
      else if (current !== row.pack) knownPacks.set(key, null);
    }
  }
  for (const row of rows) {
    if (row.mode === "case-needs-reference") row.pack = knownPacks.get(normalizedName(row.name));
  }

  for (const row of rows) {
    if (row.skip) continue;
    const pack = row.mode === "units" ? 1 : row.pack;
    if (!Number.isInteger(pack) || pack <= 0) {
      row.skip = "pack/case count is ambiguous";
      continue;
    }
    if (!Number.isFinite(row.rawQty) || row.rawQty <= 0) {
      row.skip = "quantity is missing or invalid";
      continue;
    }
    if (!Number.isFinite(row.rawTotal) || row.rawTotal < 0) {
      row.skip = "line total is missing or invalid";
      continue;
    }
    row.units = row.rawQty * pack;
    row.unitCostOriginal = round2(row.rawTotal / row.units);
  }

  return rows;
};

const main = async () => {
  if (!fs.existsSync(INPUT)) throw new Error(`Workbook not found: ${INPUT}`);
  const sourceBytes = fs.readFileSync(INPUT);
  const sourceHash = crypto.createHash("sha256").update(sourceBytes).digest("hex");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(sourceBytes);

  const uri = process.env.MONGODB_URL || process.env.MONGO_URI;
  if (!uri) throw new Error("MONGODB_URL/MONGO_URI is not configured");
  await mongoose.connect(uri);

  const runs = mongoose.connection.db.collection("invoiceImportRuns");
  const backups = mongoose.connection.db.collection("invoiceImportBackups");
  const previous = await runs.findOne({ sourceHash, status: "completed" });
  if (previous) {
    console.log(`Already imported as run ${previous.runId}; no changes made.`);
    return;
  }

  const store = await Store.findOne({ key: "shop" }).lean();
  const shopCurrency = store?.currency || "EUR";
  const rates = store?.exchangeRates || {};
  const rows = await workbookRows(workbook);

  const products = await Product.find({}).lean();
  const productsByName = new Map();
  for (const product of products) {
    const key = normalizedName(product.name);
    if (!productsByName.has(key)) productsByName.set(key, []);
    productsByName.get(key).push(product);
  }

  // Products eligible for safe creation are confined to rows that carry an
  // explicit RRP. Other invoice sheets contain cost only, so inventing a shelf
  // price for them would be unsafe.
  const creatable = new Map();
  for (const row of rows) {
    if (
      !row.skip &&
      row.currency === shopCurrency &&
      Number.isFinite(row.rrp) &&
      row.rrp > 0 &&
      // A newly created product must have a commercially plausible unit
      // relationship. A line whose parsed cost is already at/above its RRP is
      // almost certainly using a different pack convention; skip it for review.
      Number.isFinite(row.unitCostOriginal) &&
      row.rrp > row.unitCostOriginal
    ) {
      creatable.set(normalizedName(row.name), row);
    }
  }

  const groups = new Map();
  const skipped = [];

  for (const row of rows) {
    if (row.skip) {
      skipped.push({ ...row });
      continue;
    }

    let rate = 1;
    if (row.currency !== shopCurrency) {
      rate = Number(rates?.[row.currency]);
      if (!Number.isFinite(rate) || rate <= 0) {
        skipped.push({ ...row, skip: `no ${row.currency}->${shopCurrency} exchange rate saved` });
        continue;
      }
    }
    row.unitCost = round2(row.unitCostOriginal * rate);
    row.rate = rate;

    const invoiceKey = normalizedName(row.name);
    const aliasKey = REVIEWED_ALIASES.get(invoiceKey);
    const candidates = productsByName.get(invoiceKey) || productsByName.get(aliasKey) || [];

    let groupKey;
    let product = null;
    if (candidates.length === 1) {
      product = candidates[0];
      groupKey = `existing:${product._id}`;
    } else if (candidates.length > 1) {
      skipped.push({ ...row, skip: "multiple database products share this name" });
      continue;
    } else if (creatable.has(invoiceKey)) {
      groupKey = `new:${invoiceKey}`;
    } else {
      skipped.push({ ...row, skip: "no exact/reviewed database match and no explicit RRP" });
      continue;
    }

    if (!groups.has(groupKey)) {
      const seed = creatable.get(invoiceKey) || row;
      groups.set(groupKey, {
        key: groupKey,
        product,
        name: product?.name || seed.name,
        rrp: product?.Price ?? seed.rrp,
        receipts: [],
      });
    }
    groups.get(groupKey).receipts.push(row);
  }

  const plan = [...groups.values()].map((group) => {
    const receipts = group.receipts.sort(
      (a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0)
    );
    const latest = receipts[receipts.length - 1];
    return {
      ...group,
      receipts,
      latest,
      quantity: receipts.reduce((sum, row) => sum + row.units, 0),
      costPrice: latest.unitCost,
      costSource:
        latest.currency === shopCurrency
          ? null
          : {
              amount: latest.unitCostOriginal,
              currency: latest.currency,
              rate: latest.rate,
              note: `${latest.supplier} invoice ${latest.invoice}`,
            },
    };
  });

  const reasonCounts = {};
  for (const row of skipped) reasonCounts[row.skip] = (reasonCounts[row.skip] || 0) + 1;

  const summary = {
    workbook: path.basename(INPUT),
    sourceHash,
    shopCurrency,
    sourceRows: rows.length,
    plannedProducts: plan.length,
    existingProducts: plan.filter((x) => x.product).length,
    newProducts: plan.filter((x) => !x.product).length,
    stockUnits: plan.reduce((sum, x) => sum + x.quantity, 0),
    stockTransactions: plan.reduce((sum, x) => sum + x.receipts.length, 0),
    skippedRows: skipped.length,
    skippedByReason: reasonCounts,
  };

  console.log(JSON.stringify(summary, null, 2));
  console.log("\nPLANNED PRODUCTS");
  for (const item of plan) {
    console.log(
      `${item.product ? "UPDATE" : "CREATE"} | ${item.name} | qty ${item.quantity} | cost ${item.costPrice} ${shopCurrency} | sell ${item.rrp}`
    );
  }

  if (!APPLY) {
    console.log("\nDRY RUN - no database changes. Re-run with --apply after review.");
    return;
  }

  const runId = `invoice-${new Date().toISOString().replace(/[:.]/g, "-")}-${sourceHash.slice(0, 8)}`;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const duplicate = await runs.findOne({ sourceHash, status: "completed" }, { session });
      if (duplicate) throw new Error(`Workbook already imported as ${duplicate.runId}`);

      const categoryNames = [...new Set(plan.filter((x) => !x.product).map((x) => categoryNameFor(x.name)))];
      const categoryDocs = await Category.find({ name: { $in: categoryNames } }).session(session);
      const categoriesByName = new Map(categoryDocs.map((doc) => [doc.name, doc]));
      const fallback =
        (await Category.findOne({ name: "Miscellaneous" }).session(session)) ||
        (await Category.create([{ name: "Miscellaneous" }], { session })).at(0);

      const supplierNames = [...new Set(plan.flatMap((x) => x.receipts.map((r) => r.supplier)))];
      const supplierDocs = new Map();
      for (const name of supplierNames) {
        let supplier = await Supplier.findOne({ name }).session(session);
        if (!supplier) supplier = (await Supplier.create([{ name }], { session }))[0];
        supplierDocs.set(name, supplier);
      }

      const savedProducts = new Map();
      for (const item of plan) {
        let product;
        if (item.product) {
          product = await Product.findById(item.product._id).session(session);
          await backups.insertOne(
            {
              runId,
              operation: "update",
              productId: product._id,
              before: product.toObject(),
              sourceRows: item.receipts.map(({ sheet, row, invoice }) => ({ sheet, row, invoice })),
              createdAt: new Date(),
            },
            { session }
          );
        } else {
          const categoryName = categoryNameFor(item.name);
          const category = categoriesByName.get(categoryName) || fallback;
          product = new Product({
            name: item.name,
            Price: item.rrp,
            Category: category._id,
            Desciption: "Created from verified supplier invoice data.",
          });
        }

        product.quantity = item.quantity;
        product.costPrice = item.costPrice;
        product.costSource = item.costSource || undefined;
        product.supplier = supplierDocs.get(item.latest.supplier)?._id;
        await product.save({ session });

        if (!item.product) {
          await backups.insertOne(
            {
              runId,
              operation: "create",
              productId: product._id,
              before: null,
              sourceRows: item.receipts.map(({ sheet, row, invoice }) => ({ sheet, row, invoice })),
              createdAt: new Date(),
            },
            { session }
          );
        }

        savedProducts.set(item.key, product);
        for (const receipt of item.receipts) {
          await StockTransaction.create(
            [
              {
                product: product._id,
                type: "Stock-in",
                quantity: receipt.units,
                supplier: supplierDocs.get(receipt.supplier)?._id,
                reference: `Invoice ${receipt.invoice} - ${receipt.sheet} row ${receipt.row} - ${runId}`,
                transactionDate: receipt.date || new Date(),
              },
            ],
            { session }
          );
        }
      }

      await runs.insertOne(
        {
          runId,
          sourceHash,
          sourcePath: INPUT,
          status: "completed",
          appliedAt: new Date(),
          summary,
          skipped: skipped.map(({ sheet, row, name, invoice, skip }) => ({
            sheet,
            row,
            name,
            invoice,
            reason: skip,
          })),
        },
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  console.log(`\nAPPLIED ${runId}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
