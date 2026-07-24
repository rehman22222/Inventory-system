require("dotenv").config();
const mongoose = require("mongoose");
const Store = require("../models/Storemodel");
const Product = require("../models/Productmodel");
const OnlineListing = require("../models/OnlineListingmodel");
const OnlineCategory = require("../models/OnlineCategorymodel");
const OnlineHeroSlide = require("../models/OnlineHeroSlidemodel");
const OnlineStoreSetting = require("../models/OnlineStoreSettingmodel");

async function main() {
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not configured");
  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 20_000 });
  const store = await Store.findOne({ key: "shop" }).lean();
  if (!store) throw new Error("Store key=shop was not found");

  const [slides, settings, liveListings, activeCategories, sourceProducts, wrongStock] =
    await Promise.all([
      OnlineHeroSlide.find({ store: store._id, active: true })
        .populate("listing", "webName slug listed")
        .sort({ sortWeight: 1 })
        .lean(),
      OnlineStoreSetting.findOne({ store: store._id }).lean(),
      OnlineListing.countDocuments({ store: store._id, listed: true }),
      OnlineCategory.countDocuments({ store: store._id, active: true }),
      Product.countDocuments({ "onlineSource.provider": "shopify" }),
      Product.countDocuments({
        "onlineSource.provider": "shopify",
        quantity: { $ne: 1 },
      }),
    ]);

  const result = {
    ok:
      store.currency === "EUR" &&
      slides.length === 4 &&
      slides.every((slide) => slide.image && slide.listing?.listed) &&
      Boolean(settings) &&
      Object.prototype.hasOwnProperty.call(settings.social || {}, "tiktok") &&
      wrongStock === 0,
    currency: store.currency,
    liveListings,
    activeCategories,
    shopifyInventoryRows: sourceProducts,
    shopifyRowsNotAtQuantityOne: wrongStock,
    activeSlides: slides.map((slide) => ({
      title: slide.titleTop,
      product: slide.listing?.webName,
      image: Boolean(slide.image),
      editable: true,
    })),
    socialPlatforms: ["instagram", "facebook", "twitter", "tiktok"],
    configuredSocialLinks: Object.entries(settings?.social || {})
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key),
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
