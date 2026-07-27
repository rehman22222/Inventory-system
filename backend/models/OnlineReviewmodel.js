const mongoose = require("mongoose");

// A customer review of one product, tied to the online order it was bought in.
//
// Reviews are only ever created through a tokenised link emailed after the
// order is delivered, so every review is a genuine, verified purchase — there
// is no public "write a review" form to game. The owner can hide or delete a
// review from the admin, but cannot invent one.
const OnlineReviewSchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    // The storefront reads by listing (its slug is the product page url).
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OnlineListing",
      required: true,
    },
    // The inventory product actually bought (a listing may have variants that
    // each point at their own product).
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OnlineOrder",
      required: true,
    },
    orderNo: { type: String, required: true },

    // Snapshot of who wrote it — the record still reads correctly if the order
    // is ever purged.
    customerName: { type: String, required: true, trim: true },
    customerEmail: { type: String, required: true, trim: true, lowercase: true },

    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: "", trim: true, maxlength: 120 },
    body: { type: String, default: "", trim: true, maxlength: 2000 },

    // Always true today (only verified purchasers can review) but kept explicit
    // so the storefront can render the "Verified Purchase" badge without a join.
    verified: { type: Boolean, default: true },

    // Auto-published; the owner can flip to "hidden" to pull it from the site
    // without deleting the record.
    status: {
      type: String,
      enum: ["published", "hidden"],
      default: "published",
    },
  },
  { timestamps: true },
);

// The storefront's main read: a product page's published reviews, newest first.
OnlineReviewSchema.index({ store: 1, listing: 1, status: 1, createdAt: -1 });
// One review per product per order — a customer reviews each item once.
OnlineReviewSchema.index({ order: 1, product: 1 }, { unique: true });

module.exports = mongoose.model("OnlineReview", OnlineReviewSchema);
