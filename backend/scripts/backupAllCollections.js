/* Full read-only snapshot of every collection in the IMS database.
 *
 * Written as Extended JSON (one file per collection) so ObjectIds, Dates and
 * Decimals survive the round trip and the dump can be restored as-is. No
 * mongodump on this machine, so this is the restore point. */
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const { EJSON } = require("bson");

const BACKEND = process.argv[2];
const OUT = process.argv[3];
require("dotenv").config({ path: path.join(BACKEND, ".env") });

(async () => {
  const client = new MongoClient(process.env.MONGODB_URL);
  await client.connect();
  const db = client.db();
  fs.mkdirSync(OUT, { recursive: true });

  const collections = await db.listCollections().toArray();
  collections.sort((a, b) => a.name.localeCompare(b.name));

  const manifest = {
    takenAt: new Date().toISOString(),
    database: db.databaseName,
    collections: [],
  };

  let grandTotal = 0;
  for (const info of collections) {
    if (info.type && info.type !== "collection") continue;
    const name = info.name;
    const docs = await db.collection(name).find({}).toArray();
    const file = path.join(OUT, `${name}.json`);
    fs.writeFileSync(file, EJSON.stringify(docs, { relaxed: false }), "utf8");
    const bytes = fs.statSync(file).size;
    manifest.collections.push({ name, count: docs.length, bytes });
    grandTotal += docs.length;
    console.log(`${name.padEnd(28)} ${String(docs.length).padStart(7)} docs  ${(bytes / 1024).toFixed(0)} KB`);
  }

  manifest.totalDocuments = grandTotal;
  fs.writeFileSync(path.join(OUT, "_manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`\ncollections: ${manifest.collections.length}  documents: ${grandTotal}`);
  console.log(`backup dir : ${OUT}`);
  await client.close();
})().catch((e) => {
  console.error("BACKUP FAILED:", e.message);
  process.exit(1);
});
