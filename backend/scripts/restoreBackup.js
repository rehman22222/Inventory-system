/* Restore a backup directory into a named database. Used to build the rehearsal
 * copy, and it is also the way back if the live migration ever has to be undone.
 * Refuses to run without --force when the target already holds data. */
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const { EJSON } = require("bson");

const BACKEND = process.argv[2];
const DIR = process.argv[3];
const TARGET_DB = process.argv[4];
const FORCE = process.argv.includes("--force");
require("dotenv").config({ path: path.join(BACKEND, ".env") });

(async () => {
  const client = new MongoClient(process.env.MONGODB_URL);
  await client.connect();
  const db = client.db(TARGET_DB);

  const existing = await db.listCollections().toArray();
  const populated = [];
  for (const c of existing) {
    const n = await db.collection(c.name).estimatedDocumentCount();
    if (n > 0) populated.push(`${c.name}(${n})`);
  }
  if (populated.length && !FORCE) {
    console.error(`REFUSING: ${TARGET_DB} already holds data: ${populated.join(", ")}`);
    console.error("Pass --force to wipe and restore over it.");
    await client.close();
    process.exit(1);
  }

  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "_manifest.json");
  let total = 0;
  for (const file of files) {
    const name = file.replace(/\.json$/, "");
    const docs = EJSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"), { relaxed: false });
    await db.collection(name).deleteMany({});
    if (docs.length) await db.collection(name).insertMany(docs, { ordered: false });
    total += docs.length;
    console.log(`${name.padEnd(30)} ${String(docs.length).padStart(6)} docs`);
  }
  console.log(`\nrestored ${files.length} collections / ${total} documents into "${TARGET_DB}"`);
  await client.close();
})().catch((e) => {
  console.error("RESTORE FAILED:", e.message);
  process.exit(1);
});
