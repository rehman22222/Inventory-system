/* Put every scannable product's name into capitals.
 *
 *   npm run uppercase-names                 # do it
 *   npm run uppercase-names -- --dry-run    # show what would change, write nothing
 *   npm run uppercase-names -- --restore backups/names-2026-09-06T....json
 *
 * The catalogue was imported from several places over time and the casing came
 * with it — "Mentos Mint Flavour" beside "7DAY HOSPITAL" beside "7up Classic".
 * At a counter that reads as three different systems. Capitals are what is
 * printed on the packaging the cashier is holding, so capitals are what the
 * till should show.
 *
 * ONLY products with a barcode. A product without one never reaches the till's
 * grid, so its name is not what a cashier is matching against a box — and the
 * quick-sell cards, which have no barcode by definition, keep the names the
 * shop typed for them.
 *
 * It writes a restore file BEFORE touching anything: every product it is about
 * to rename, with the name it had. A bulk edit to a live catalogue is the kind
 * you cannot undo from memory, and the file is the undo.
 *
 * Safe on the website. Every product here that is also listed online carries
 * its own `webName`, which is what the storefront actually renders — this was
 * checked before the script was written, and the check is repeated below so it
 * stays true rather than staying an assumption.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Product = require("../models/Productmodel");
const OnlineListing = require("../models/OnlineListingmodel");

const BACKUP_DIR = path.join(__dirname, "backups");

// A barcode that is present but blank is the same as no barcode at all.
const SCANNABLE = { barcode: { $exists: true, $nin: [null, ""] } };

const restoreFrom = async (file) => {
  const full = path.isAbsolute(file) ? file : path.join(__dirname, file);
  const saved = JSON.parse(fs.readFileSync(full, "utf8"));

  console.log(`Restoring ${saved.products.length} names from ${path.basename(full)} …`);

  const writes = saved.products.map((row) => ({
    updateOne: { filter: { _id: row._id }, update: { $set: { name: row.name } } },
  }));

  let done = 0;
  for (let i = 0; i < writes.length; i += 500) {
    const chunk = writes.slice(i, i + 500);
    await Product.bulkWrite(chunk, { ordered: false });
    done += chunk.length;
    console.log(`  ${done}/${writes.length}`);
  }

  console.log(`Restored ${done} names to what they were at ${saved.takenAt}.`);
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
  console.log(`connected to ${mongoose.connection.name}\n`);

  const restoreAt = args.indexOf("--restore");
  if (restoreAt !== -1) {
    await restoreFrom(args[restoreAt + 1]);
    await mongoose.disconnect();
    return;
  }

  const dryRun = args.includes("--dry-run");

  const before = await Product.find(SCANNABLE).select("_id name barcode").lean();

  if (before.length === 0) {
    console.log("No barcoded products found — nothing to do.");
    await mongoose.disconnect();
    return;
  }

  // Only the ones that actually differ. Rewriting a name to itself is a write
  // for nothing, and it would pad the restore file with rows that never moved.
  const changing = before.filter((p) => {
    const upper = String(p.name || "").toUpperCase();
    return upper && upper !== p.name;
  });

  console.log(`${before.length} barcoded products.`);
  console.log(`  ${before.length - changing.length} already in capitals.`);
  console.log(`  ${changing.length} to change.\n`);

  if (changing.length === 0) {
    console.log("Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  /* The website check, run every time rather than trusted once.
   *
   * The storefront renders `listing.webName || product.name`, so a listed
   * product with no webName of its own would start shouting on the shop's
   * website as a side effect of a till change. If that is ever true this stops
   * and says which ones, instead of doing it and being found out later. */
  const listings = await OnlineListing.find({})
    .select("product variants.product webName")
    .lean();

  const exposed = new Set();
  for (const listing of listings) {
    if (String(listing.webName || "").trim()) continue;
    for (const id of [listing.product, ...(listing.variants || []).map((v) => v.product)]) {
      if (id) exposed.add(String(id));
    }
  }

  const wouldShout = changing.filter((p) => exposed.has(String(p._id)));

  if (wouldShout.length > 0) {
    console.error(
      `STOPPING: ${wouldShout.length} of these are sold on the website with no webName of\n` +
        `their own, so the storefront shows THIS name. Renaming them here would put the\n` +
        `shop's website into capitals as well. Give those listings a webName first:\n`,
    );
    wouldShout.slice(0, 15).forEach((p) => console.error(`   ${p.name}`));
    if (wouldShout.length > 15) console.error(`   …and ${wouldShout.length - 15} more`);
    await mongoose.disconnect();
    process.exitCode = 1;
    return;
  }
  console.log("Website check: none of these are shown by name on the storefront.\n");

  console.log("Examples:");
  changing.slice(0, 6).forEach((p) => {
    console.log(`   ${p.name}\n     -> ${p.name.toUpperCase()}`);
  });
  console.log("");

  if (dryRun) {
    console.log("--dry-run: nothing was written.");
    await mongoose.disconnect();
    return;
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(BACKUP_DIR, `names-${stamp}.json`);
  fs.writeFileSync(
    backup,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        database: mongoose.connection.name,
        products: changing.map((p) => ({
          _id: String(p._id),
          name: p.name,
          barcode: p.barcode,
        })),
      },
      null,
      2,
    ),
  );
  console.log(`Restore point: scripts/backups/${path.basename(backup)}`);
  console.log(`  ${changing.length} original names saved.\n`);

  // Batched. One update per product over a link with any latency at all turns a
  // few seconds of work into several minutes.
  let done = 0;
  for (let i = 0; i < changing.length; i += 500) {
    const chunk = changing.slice(i, i + 500);
    await Product.bulkWrite(
      chunk.map((p) => ({
        updateOne: {
          filter: { _id: p._id },
          update: { $set: { name: p.name.toUpperCase() } },
        },
      })),
      { ordered: false },
    );
    done += chunk.length;
    console.log(`  ${done}/${changing.length}`);
  }

  const left = (await Product.find(SCANNABLE).select("name").lean()).filter(
    (p) => p.name !== String(p.name || "").toUpperCase(),
  ).length;

  console.log(
    left === 0
      ? `\nDone. All ${before.length} barcoded products now read in capitals.`
      : `\nWARNING: ${left} barcoded products are still not in capitals.`,
  );
  console.log(
    `\nTo undo: npm run uppercase-names -- --restore backups/${path.basename(backup)}`,
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
