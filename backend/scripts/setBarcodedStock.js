/* Set the stock count on every product the till can scan.
 *
 *   npm run set-barcoded-stock            # sets them all to 20
 *   npm run set-barcoded-stock -- 50      # ...or to 50
 *   npm run set-barcoded-stock -- --restore backups/stock-2026-08-29T09-12-00.json
 *
 * This is a reset, not a movement: it does not write Stock-in/Stock-out rows,
 * because nothing physically arrived. Booking 1,600 deliveries that never
 * happened would leave a ledger nobody could reconcile against a supplier.
 *
 * It writes a restore file BEFORE touching anything — every product it is about
 * to change, with the count it had. Bulk edits to a live catalogue are the ones
 * you cannot undo from memory, and the file is the undo.
 *
 * Only products with a barcode are touched. A product without one never reaches
 * a basket, so its count is not what a till is being tested against.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Product = require("../models/Productmodel");

const BACKUP_DIR = path.join(__dirname, "backups");

const restoreFrom = async (file) => {
  const full = path.isAbsolute(file) ? file : path.join(__dirname, file);
  const saved = JSON.parse(fs.readFileSync(full, "utf8"));

  console.log(`Restoring ${saved.products.length} products from ${path.basename(full)} …`);

  let done = 0;
  for (const row of saved.products) {
    await Product.updateOne({ _id: row._id }, { $set: { quantity: row.quantity } });
    done += 1;
    if (done % 250 === 0) console.log(`  ${done}/${saved.products.length}`);
  }

  console.log(`Restored ${done} products to the counts they had at ${saved.takenAt}.`);
};

const run = async () => {
  const args = process.argv.slice(2);
  const uri = process.env.MONGODB_URL || process.env.MONGO_URL;

  if (!uri) {
    console.error("No MONGODB_URL in the environment.");
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log(`connected to ${mongoose.connection.name}`);

  const restoreAt = args.indexOf("--restore");
  if (restoreAt !== -1) {
    await restoreFrom(args[restoreAt + 1]);
    await mongoose.disconnect();
    return;
  }

  const quantity = Number(args[0] || 20);
  if (!Number.isInteger(quantity) || quantity < 0) {
    console.error("Quantity must be a whole number, zero or above.");
    await mongoose.disconnect();
    process.exitCode = 1;
    return;
  }

  // A barcode that is present but blank is the same as no barcode at all.
  const scannable = {
    barcode: { $exists: true, $nin: [null, ""] },
  };

  const before = await Product.find(scannable)
    .select("_id name barcode quantity")
    .lean();

  if (before.length === 0) {
    console.log("No barcoded products found — nothing to do.");
    await mongoose.disconnect();
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(BACKUP_DIR, `stock-${stamp}.json`);
  fs.writeFileSync(
    backup,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        database: mongoose.connection.name,
        settingTo: quantity,
        products: before.map((p) => ({
          _id: String(p._id),
          name: p.name,
          barcode: p.barcode,
          quantity: p.quantity,
        })),
      },
      null,
      2,
    ),
  );

  console.log(`Restore point: scripts/backups/${path.basename(backup)}`);
  console.log(`  ${before.length} barcoded products, counts saved.`);

  const alreadyThere = before.filter((p) => Number(p.quantity) === quantity).length;
  console.log(`  ${alreadyThere} are already at ${quantity}; ${before.length - alreadyThere} will change.`);

  const result = await Product.updateMany(scannable, { $set: { quantity } });
  console.log(`\nSet ${result.modifiedCount} products to ${quantity}.`);

  const check = await Product.countDocuments({ ...scannable, quantity: { $ne: quantity } });
  console.log(
    check === 0
      ? "Verified: every barcoded product now reads " + quantity + "."
      : `WARNING: ${check} barcoded products are still not at ${quantity}.`,
  );

  const untouched = await Product.countDocuments({
    $or: [{ barcode: { $exists: false } }, { barcode: null }, { barcode: "" }],
  });
  console.log(`${untouched} products without a barcode were left alone.`);

  console.log(
    `\nTo undo: npm run set-barcoded-stock -- --restore backups/${path.basename(backup)}`,
  );

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Failed:", error.message);
  try {
    await mongoose.disconnect();
  } catch {
    /* already down */
  }
  process.exitCode = 1;
});
