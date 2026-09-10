const mongoose = require("mongoose");
const OnlineListing = require("../models/OnlineListingmodel");

/* What "POS" and "Online" mean when the catalogue is narrowed to one of them.
 *
 * The Products page has an All / POS / Online switch, and the Inventory Report
 * taken from that page has to answer the same question the screen is answering
 * — otherwise the shop reads 1,808 products on screen, downloads the report,
 * and finds a different number in it with nothing to explain the gap.
 *
 * So the definition lives here rather than in either of them:
 *
 *   pos    — anything the till can scan, which is anything with a barcode.
 *   online — anything a listing actually sells, taken from the listings
 *            themselves rather than from a category name. A product that is
 *            both barcoded on the shelf AND sold on the site appears under
 *            EITHER filter, which is the whole point of it being one row.
 *   all    — the full catalogue, and the default for anything unrecognised.
 *
 * Returns a Mongo filter fragment to spread into a query. Async because
 * "online" has to go and ask the listings.
 */

const CHANNELS = ["pos", "online"];

// Normalise whatever arrived on the query string. Anything that is not one of
// the two named channels is the whole catalogue — a typo must not silently
// return an empty report.
const readChannel = (value) =>
  CHANNELS.includes(String(value || "")) ? String(value) : "all";

// Every product a listing points at, including the ones it reaches through its
// variants — a variant is a product in its own right, and a report that missed
// them would under-count the online catalogue by most of it.
async function onlineProductIds() {
  const listings = await OnlineListing.find({}).select("product variants.product").lean();

  const ids = new Set();
  for (const listing of listings) {
    if (listing.product) ids.add(String(listing.product));
    for (const variant of listing.variants || []) {
      if (variant.product) ids.add(String(variant.product));
    }
  }
  return [...ids].map((id) => new mongoose.Types.ObjectId(id));
}

async function channelScope(channel) {
  const wanted = readChannel(channel);
  if (wanted === "pos") return { barcode: { $exists: true, $nin: [null, ""] } };
  if (wanted === "online") return { _id: { $in: await onlineProductIds() } };
  return {};
}

module.exports = { CHANNELS, readChannel, channelScope, onlineProductIds };
