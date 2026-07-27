/*
 * Attach local image files to specific product variants, re-hosting each onto
 * our own Cloudinary. Use when the shop supplies flavour images directly (rather
 * than pulling them from a source store).
 *
 * Drop the images into a folder (default ./variant-images, or set DIR=...) named
 * by their flavour — any of .webp/.jpg/.jpeg/.png — e.g. "pina-colada.jpg". The
 * MAPPING below says which listing + variant each filename belongs to.
 *
 *   DIR=./variant-images node scripts/backfillVariantImagesFromFiles.js
 *   DRY_RUN=true ...   # preview matches without uploading/writing
 *   OVERWRITE=true ... # replace a variant image that already exists
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const cloudinary = require("../libs/Cloundinary");
const OnlineListing = require("../models/OnlineListingmodel");
require("../models/Productmodel");

const DIR = process.env.DIR || path.join(__dirname, "..", "variant-images");
const FOLDER = "online_store";
const DRY_RUN = process.env.DRY_RUN === "true";
const OVERWRITE = process.env.OVERWRITE === "true";
const EXTS = [".webp", ".jpg", ".jpeg", ".png"];

// filename base (no extension) -> which listing slug + variant label it is.
const MAPPING = [
  { file: "fantasy", slug: "hayati-pro-mini-600-puffs-disposable-vapes", label: "Fantasy" },
  { file: "lemon-peach-passionfruit", slug: "hayati-pro-mini-600-puffs-disposable-vapes", label: "Lemon Peach Passionfruit" },
  { file: "pina-colada", slug: "hayati-pro-mini-600-puffs-disposable-vapes", label: "Pina Colada" },
  { file: "blueberry-cherry-cranberry", slug: "hayati-pro-max-nic-salt", label: "Blueberry Cherry Cranberry" },
];

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// Find <DIR>/<base>.<ext> for the first extension that exists.
const findFile = (base) => {
  for (const ext of EXTS) {
    const p = path.join(DIR, base + ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
};

(async () => {
  try {
    if (
      !(process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME) ||
      !(process.env.CLOUDINARY_API_KEY || process.env.API_KEY)
    ) {
      throw new Error("Cloudinary is not configured (set CLOUDINARY_* in .env)");
    }
    console.log(`[files] image folder: ${DIR} (dry-run=${DRY_RUN}, overwrite=${OVERWRITE})`);
    if (!fs.existsSync(DIR))
      throw new Error(`Folder not found: ${DIR} — create it and drop the images in.`);

    await mongoose.connect(process.env.MONGODB_URL || process.env.MONGODB_URI);

    let done = 0;
    let missingFile = 0;
    let missingVariant = 0;

    for (const entry of MAPPING) {
      const filePath = findFile(entry.file);
      if (!filePath) {
        console.log(`  ✗ ${entry.file} — no file (${EXTS.join("/")}) in folder`);
        missingFile += 1;
        continue;
      }
      const listing = await OnlineListing.findOne({ slug: entry.slug });
      const variant = listing?.variants?.find(
        (v) => norm(v.label) === norm(entry.label),
      );
      if (!variant) {
        console.log(`  ✗ ${entry.label} — variant not found on ${entry.slug}`);
        missingVariant += 1;
        continue;
      }
      if (variant.image && !OVERWRITE) {
        console.log(`  ↷ ${entry.label} — already has an image (use OVERWRITE=true)`);
        continue;
      }
      if (DRY_RUN) {
        console.log(`  ✓ ${entry.label} <= ${path.basename(filePath)}`);
        done += 1;
        continue;
      }
      const r = await cloudinary.uploader.upload(filePath, { folder: FOLDER });
      variant.image = r.secure_url;
      await listing.save();
      console.log(`  ✓ ${entry.label} -> ${r.secure_url}`);
      done += 1;
    }

    console.log("──────────────────────────────────────────────");
    console.log(`[files] set: ${done}  missing file: ${missingFile}  missing variant: ${missingVariant}`);
    console.log(DRY_RUN ? "[files] DRY RUN — nothing written" : "[files] saved");
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("[files] failed:", error.message);
    process.exit(1);
  }
})();
