/* Configure the professional storefront shell without touching inventory.
 *
 * Usage:
 *   node scripts/configureOnlineStoreExperience.js          # dry run
 *   node scripts/configureOnlineStoreExperience.js --apply  # backup + apply
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Store = require("../models/Storemodel");
const OnlineListing = require("../models/OnlineListingmodel");
const OnlineHeroSlide = require("../models/OnlineHeroSlidemodel");
const OnlineStoreSetting = require("../models/OnlineStoreSettingmodel");
require("../models/Productmodel");

const apply = process.argv.includes("--apply");

const campaigns = [
  {
    match: [/PIXL 6000/i, /PIXL/i],
    eyebrow: "Pocket power · premium flavour",
    titleTop: "PIXL 6000",
    titleItalic: "big flavour",
    titleBadge: "small cloud",
    titleBottom: "ready when you are.",
    copy: "Discover the compact PIXL range with punchy flavour and a clean, convenient format.",
    burst: { top: "Shop", big: "PIXL", bottom: "range" },
    tone: "ink",
  },
  {
    match: [/CUBA WHITE/i, /CUBA/i],
    eyebrow: "Fresh nicotine pouch collection",
    titleTop: "CUBA WHITE",
    titleItalic: "clean",
    titleBadge: "bold",
    titleBottom: "nicotine pouches.",
    copy: "A focused collection of fresh profiles in a discreet, tobacco-free pouch format.",
    burst: { top: "Fresh", big: "CUBA", bottom: "drop" },
    tone: "cream",
  },
  {
    match: [/VAPORESSO XROS PRO/i, /XROS PRO/i, /VAPORESSO XROS/i],
    eyebrow: "Vaporesso pod technology",
    titleTop: "XROS PRO",
    titleItalic: "precision",
    titleBadge: "meets",
    titleBottom: "everyday control.",
    copy: "A refined pod experience with confident performance, intelligent control and premium finish.",
    burst: { top: "Pro", big: "XROS", bottom: "series" },
    tone: "accent",
  },
  {
    match: [/HAZE.*SLEEP.*GUMM/i, /CBD.*SLEEP.*GUMM/i, /LOST MARY/i],
    eyebrow: "Explore a customer favourite",
    titleTop: "WIND DOWN",
    titleItalic: "discover",
    titleBadge: "something",
    titleBottom: "different.",
    copy: "Browse one of CliffsOfPuff's standout collections, selected directly from the live catalogue.",
    burst: { top: "New", big: "TRY", bottom: "today" },
    tone: "ink",
  },
];

async function main() {
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not configured");
  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 20_000 });
  const store = await Store.findOne({ key: "shop" }).lean();
  if (!store) throw new Error("Store key=shop was not found");

  const listings = await OnlineListing.find({ store: store._id, listed: true })
    .populate("product", "name Price quantity image")
    .sort({ sortWeight: 1 })
    .lean();
  const selected = [];
  const used = new Set();
  for (const campaign of campaigns) {
    const listing = listings.find(
      (item) =>
        !used.has(String(item._id)) &&
        campaign.match.some((pattern) =>
          pattern.test(`${item.webName || ""} ${item.product?.name || ""}`)
        )
    );
    if (!listing) continue;
    const productName = `${listing.webName || ""} ${listing.product?.name || ""}`;
    const effectiveCampaign =
      campaign.titleTop === "XROS PRO" && !/XROS PRO/i.test(productName)
        ? {
            ...campaign,
            titleTop: /XROS 4 MINI/i.test(productName) ? "XROS 4 MINI" : "VAPORESSO XROS",
            copy:
              "A refined pod experience with confident performance, simple control and premium finish.",
          }
        : campaign;
    selected.push({ campaign: effectiveCampaign, listing });
    used.add(String(listing._id));
  }
  if (selected.length < 4) {
    for (const listing of listings) {
      if (selected.length >= 4) break;
      if (used.has(String(listing._id)) || !listing.gallery?.[0]?.url) continue;
      selected.push({
        campaign: {
          ...campaigns[selected.length],
          titleTop: listing.webName || listing.product?.name || "Featured product",
        },
        listing,
      });
      used.add(String(listing._id));
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        store: store.name,
        selected: selected.map(({ campaign, listing }) => ({
          headline: campaign.titleTop,
          product: listing.webName || listing.product?.name,
          hasImage: Boolean(listing.gallery?.[0]?.url || listing.product?.image?.url),
        })),
      },
      null,
      2
    )
  );
  if (!apply) return;
  if (selected.length < 4) throw new Error("Could not find four live products for hero slides");

  const existingSlides = await OnlineHeroSlide.find({ store: store._id }).lean();
  const existingSettings = await OnlineStoreSetting.findOne({ store: store._id }).lean();
  await mongoose.connection.db.collection("onlineStoreExperienceBackups").insertOne({
    createdAt: new Date(),
    reason: "Professional promotions, social footer and four-slide hero",
    store: store._id,
    slides: existingSlides,
    settings: existingSettings,
  });

  await OnlineStoreSetting.findOneAndUpdate(
    { store: store._id },
    { $setOnInsert: { store: store._id } },
    { upsert: true, setDefaultsOnInsert: true }
  );
  await OnlineHeroSlide.updateMany({ store: store._id }, { $set: { active: false } });

  for (let index = 0; index < selected.length; index += 1) {
    const { campaign, listing } = selected[index];
    const image = listing.gallery?.[0]?.url || listing.product?.image?.url || "";
    const name = listing.webName || listing.product?.name || campaign.titleTop;
    await OnlineHeroSlide.findOneAndUpdate(
      { store: store._id, titleTop: campaign.titleTop },
      {
        $set: {
          store: store._id,
          ...campaign,
          listing: listing._id,
          image,
          imageAlt: name,
          ctaPrimary: {
            label: "Shop this product",
            to: "/product/$id",
            params: { id: listing.slug },
          },
          ctaSecondary: { label: "Browse all", to: "/shop", params: {} },
          active: true,
          sortWeight: index * 10,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const active = await OnlineHeroSlide.countDocuments({ store: store._id, active: true });
  console.log(JSON.stringify({ applied: true, activeSlides: active, backupCreated: true }));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
