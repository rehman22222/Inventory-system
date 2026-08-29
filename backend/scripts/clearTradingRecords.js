/* Hand the shop over with nothing traded on it yet.
 *
 *   npm run clear-trading -- --dry     # count everything, delete nothing
 *   npm run clear-trading -- --yes     # do it
 *
 * Deletes what the shop DID: sales, receipts (and the refunds inside them),
 * day closings and held sales. Then resets the receipt, refund and day-closing
 * numbers so the client's first sale is POS-000001 rather than POS-000098.
 *
 * Keeps what the shop IS: products and their counts, categories, suppliers,
 * deals, vouchers, users, store settings, and the stock and activity history.
 * A catalogue is the thing being handed over; the till receipts from building
 * it are not.
 *
 * It refuses to run without --yes, and takes a full Extended JSON backup of
 * every affected collection first. There is no undo beyond that file.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const { EJSON } = require("bson");

const BACKUP_DIR = path.join(__dirname, "backups");

// What the shop did, as opposed to what it is. Collection names are Mongoose's
// pluralised model names — "stocktranscations" is spelt the way the model is.
const TRADING = [
  { name: "sales", what: "sale lines" },
  { name: "receipts", what: "receipts (refunds live inside these)" },
  { name: "dayclosings", what: "day closings" },
  { name: "heldsales", what: "suspended baskets" },
];

// Numbering starts again, or the client's first receipt looks like their
// ninety-eighth.
const SEQUENCES = ["receipt", "refund", "dayClosing"];

const run = async () => {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry");
  const confirmed = args.includes("--yes");

  if (!dry && !confirmed) {
    console.error(
      "Refusing to delete anything without --yes.\n" +
        "  npm run clear-trading -- --dry    to see the counts\n" +
        "  npm run clear-trading -- --yes    to do it",
    );
    process.exitCode = 1;
    return;
  }

  const client = new MongoClient(process.env.MONGODB_URL);
  await client.connect();
  const db = client.db();
  console.log(`connected to ${db.databaseName}\n`);

  const present = new Set((await db.listCollections().toArray()).map((c) => c.name));

  console.log(dry ? "── would delete ─────────────────" : "── deleting ─────────────────────");
  const plan = [];
  for (const entry of TRADING) {
    if (!present.has(entry.name)) {
      console.log(`  ${entry.name.padEnd(14)} (not in this database)`);
      continue;
    }
    const count = await db.collection(entry.name).countDocuments();
    console.log(`  ${entry.name.padEnd(14)} ${String(count).padStart(6)}  ${entry.what}`);
    plan.push({ ...entry, count });
  }

  const total = plan.reduce((sum, entry) => sum + entry.count, 0);
  console.log(`  ${"".padEnd(14)} ${String(total).padStart(6)}  documents in total`);

  if (dry) {
    console.log("\nDry run — nothing was changed.");
    await client.close();
    return;
  }

  // The backup is the only way back. Written before a single delete.
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(BACKUP_DIR, `trading-${stamp}.json`);

  const dump = { takenAt: new Date().toISOString(), database: db.databaseName, collections: {} };
  for (const entry of plan) {
    dump.collections[entry.name] = await db.collection(entry.name).find({}).toArray();
  }
  dump.collections.counters = await db.collection("counters").find({}).toArray();
  fs.writeFileSync(backup, EJSON.stringify(dump, { relaxed: false }, 2));
  console.log(`\nBackup: scripts/backups/${path.basename(backup)}`);

  console.log("\n── done ─────────────────────────");
  for (const entry of plan) {
    const result = await db.collection(entry.name).deleteMany({});
    console.log(`  ${entry.name.padEnd(14)} ${String(result.deletedCount).padStart(6)} deleted`);
  }

  // Back to zero, so the next call to nextSequence() returns 1.
  if (present.has("counters")) {
    const reset = await db
      .collection("counters")
      .updateMany({ _id: { $in: SEQUENCES } }, { $set: { seq: 0 } });
    console.log(`  ${"numbering".padEnd(14)} ${String(reset.modifiedCount).padStart(6)} sequences reset to 0`);
  }

  console.log("\n── kept ─────────────────────────");
  for (const name of [
    "products",
    "categories",
    "suppliers",
    "deals",
    "vouchers",
    "users",
    "stores",
    "stocktranscations",
    "activitylogs",
    "orders",
  ]) {
    if (!present.has(name)) continue;
    const count = await db.collection(name).countDocuments();
    console.log(`  ${name.padEnd(18)} ${String(count).padStart(6)}`);
  }

  console.log(
    `\nThe next sale will be POS-000001.\nRestore point: scripts/backups/${path.basename(backup)}`,
  );

  await client.close();
};

run().catch(async (error) => {
  console.error("Failed:", error.message);
  process.exitCode = 1;
});
