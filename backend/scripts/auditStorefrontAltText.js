// Read-only inventory of images and alternative text used by the storefront.
require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/Productmodel");
const OnlineListing = require("../models/OnlineListingmodel");
const OnlineCategory = require("../models/OnlineCategorymodel");
const OnlineHeroSlide = require("../models/OnlineHeroSlidemodel");
const OnlineStoreSetting = require("../models/OnlineStoreSettingmodel");
const OnlineBlogPost = require("../models/OnlineBlogPostmodel");

const present = (value) => Boolean(String(value || "").trim());
const result = { total: 0, withAlt: 0, missingAlt: 0, byType: {} };
const count = (type, image, alt) => {
  if (!present(image)) return;
  const row = result.byType[type] ||= { total: 0, withAlt: 0, missingAlt: 0 };
  result.total += 1;
  row.total += 1;
  if (present(alt)) { result.withAlt += 1; row.withAlt += 1; }
  else { result.missingAlt += 1; row.missingAlt += 1; }
};

async function main() {
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not configured");
  await mongoose.connect(process.env.MONGODB_URL);

  const [listings, categories, slides, settings, posts] = await Promise.all([
    OnlineListing.find({ listed: true }).populate("product", "name image").lean(),
    OnlineCategory.find({ active: true }).lean(),
    OnlineHeroSlide.find({ active: true }).lean(),
    OnlineStoreSetting.find({}).lean(),
    OnlineBlogPost.find({ status: "published" }).lean(),
  ]);

  for (const listing of listings) {
    const fallback = listing.catalogImage?.alt || listing.webName || listing.product?.name;
    for (const image of listing.gallery || []) count("Product gallery", image.url, image.alt || fallback);
    count("Product fallback", !listing.gallery?.length ? listing.product?.image?.url : "", fallback);
    count("Catalogue cover", listing.catalogImage?.url, listing.catalogImage?.alt || fallback);
    count("Deal artwork", listing.dealImage?.url, listing.dealImage?.alt || fallback);
    for (const variant of listing.variants || []) count("Variant", variant.image, variant.imageAlt || variant.label || fallback);
    for (const linked of listing.linkedListings || []) count("Linked product", linked.image, linked.imageAlt || linked.label || fallback);
  }
  for (const category of categories) count("Category", category.image, category.imageAlt || category.name);
  for (const slide of slides) {
    count("Hero desktop", slide.image, slide.imageAlt || slide.titleTop || slide.titleBottom);
    count("Hero mobile", slide.mobileImage, slide.mobileImageAlt || slide.imageAlt || slide.titleTop || slide.titleBottom);
  }
  for (const setting of settings) {
    count("Store logo", setting.logo, setting.logoAlt);
    count("Footer payment", setting.footer?.paymentImage, setting.footer?.paymentImageAlt);
    count("Footer restriction", setting.footer?.restrictionImage, setting.footer?.restrictionImageAlt);
    if (setting.events?.enabled) {
      count("Event heading", setting.events.headingImage?.url, setting.events.headingImage?.alt || setting.events.heading);
      for (const item of setting.events.items || []) {
        if (item.enabled) count("Event card", item.image?.url, item.image?.alt || item.title);
      }
    }
  }
  for (const post of posts) {
    count("Blog cover", post.coverImage, post.coverAlt || post.title);
    for (const block of post.blocks || []) if (block.type === "image") count("Blog content", block.url, block.alt || block.caption);
    for (const match of String(post.content || "").matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
      const alt = match[0].match(/\balt=["']([^"']*)["']/i)?.[1] || "";
      count("Blog content", match[1], alt);
    }
  }

  console.log(JSON.stringify({ scope: "active public storefront", liveListings: listings.length, ...result }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
