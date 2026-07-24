require("dotenv").config();
const mongoose = require("mongoose");
const Store = require("../models/Storemodel");
const OnlineStoreSetting = require("../models/OnlineStoreSettingmodel");

const applyChanges = process.argv.includes("--apply");
const editablePaths = [
  "footer.description",
  "announcement.primary",
  "announcement.secondary",
  "newThisWeek.eyebrow",
  "newThisWeek.title",
  "newThisWeek.subtitle",
  "deals.eyebrow",
  "deals.title",
  "deals.subtitle",
  "deals.ctaLabel",
];

function canonicalizeBrand(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/Candy Cloud Vape/gi, "CliffsOfPuff")
    .replace(/Candy Cloud team/gi, "CliffsOfPuff team")
    .replace(/Candy Cloud's/gi, "CliffsOfPuff's")
    .replace(/ClipsOfPuff/gi, "CliffsOfPuff")
    .replace(/Cliffs of Puff/gi, "CliffsOfPuff")
    .replace(/21\+\s*only/gi, "18+ only");
}

function readPath(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

async function main() {
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not configured");
  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 20_000 });

  const store = await Store.findOne({ key: "shop" }).lean();
  if (!store) throw new Error("Store key=shop was not found");

  const settings = await OnlineStoreSetting.findOne({ store: store._id }).lean();
  if (!settings) throw new Error("Online-store settings were not found");

  const updates = {};
  for (const path of editablePaths) {
    const current = readPath(settings, path);
    const canonical = canonicalizeBrand(current);
    if (current !== canonical) updates[path] = canonical;
  }

  const changedPaths = Object.keys(updates);
  if (changedPaths.length === 0) {
    console.log(JSON.stringify({ ok: true, applied: false, changedPaths: [] }, null, 2));
    return;
  }

  if (!applyChanges) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          applied: false,
          dryRun: true,
          changedPaths,
          next: "Run with --apply to back up and update these fields.",
        },
        null,
        2,
      ),
    );
    return;
  }

  const backups = mongoose.connection.db.collection("onlineStoreBrandBackups");
  const backup = await backups.insertOne({
    createdAt: new Date(),
    reason: "Standardize storefront branding and 18+ age language",
    store: store._id,
    changedPaths,
    settings,
  });

  await OnlineStoreSetting.updateOne({ _id: settings._id }, { $set: updates });
  console.log(
    JSON.stringify(
      {
        ok: true,
        applied: true,
        changedPaths,
        backupId: String(backup.insertedId),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
