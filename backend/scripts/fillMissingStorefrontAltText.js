// Fill the remaining public storefront chrome alt text without overwriting
// anything already curated. Writes a backup before the update.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
require("../models/OnlineListingmodel");
const OnlineHeroSlide = require("../models/OnlineHeroSlidemodel");
const OnlineStoreSetting = require("../models/OnlineStoreSettingmodel");

const BACKUP_DIR = path.join(__dirname, "backups");
const text = (value) => String(value || "").trim();

async function main() {
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not configured");
  await mongoose.connect(process.env.MONGODB_URL);
  const [slides, settings] = await Promise.all([
    OnlineHeroSlide.find({ active: true })
      .populate("listing", "webName")
      .populate("listings", "webName")
      .lean(),
    OnlineStoreSetting.find({}).lean(),
  ]);

  const slidePlans = slides.map((slide) => {
    const subject = text(slide.listing?.webName)
      || (slide.listings || []).map((listing) => text(listing?.webName)).filter(Boolean).join(", ")
      || text([slide.titleTop, slide.titleItalic, slide.titleBadge, slide.titleBottom].filter(Boolean).join(" "))
      || text(slide.eyebrow)
      || "Cliffs of Puff products";
    const alt = `${subject} promotional banner`.slice(0, 160);
    const set = {};
    if (text(slide.image) && !text(slide.imageAlt)) set.imageAlt = alt;
    if (text(slide.mobileImage) && !text(slide.mobileImageAlt)) set.mobileImageAlt = alt;
    return { slide, set };
  }).filter((plan) => Object.keys(plan.set).length);

  const settingPlans = settings.map((setting) => {
    const set = {};
    if (text(setting.logo) && !text(setting.logoAlt)) set.logoAlt = "Cliffs of Puff logo";
    return { setting, set };
  }).filter((plan) => Object.keys(plan.set).length);

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(BACKUP_DIR, `storefront-missing-alt-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify({
    createdAt: new Date().toISOString(),
    slides: slidePlans.map(({ slide }) => ({ _id: slide._id, imageAlt: slide.imageAlt, mobileImageAlt: slide.mobileImageAlt })),
    settings: settingPlans.map(({ setting }) => ({ _id: setting._id, logoAlt: setting.logoAlt })),
  }, null, 2));

  await Promise.all([
    ...slidePlans.map(({ slide, set }) => OnlineHeroSlide.updateOne({ _id: slide._id }, { $set: set })),
    ...settingPlans.map(({ setting, set }) => OnlineStoreSetting.updateOne({ _id: setting._id }, { $set: set })),
  ]);

  const written = slidePlans.reduce((sum, plan) => sum + Object.keys(plan.set).length, 0)
    + settingPlans.reduce((sum, plan) => sum + Object.keys(plan.set).length, 0);
  console.log(JSON.stringify({ fieldsWritten: written, heroSlides: slidePlans.length, logos: settingPlans.length, backup }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
