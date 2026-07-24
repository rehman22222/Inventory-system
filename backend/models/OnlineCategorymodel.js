const mongoose = require("mongoose");

// A category as the ONLINE STORE presents it. Deliberately separate from the
// till's Category collection: the shop floor groups things for speed of
// ringing up, the website groups them for browsing and SEO, and the owner
// should be able to reshape the storefront without touching the POS catalogue.
//
// `store` is carried on every online document from day one. Today there is one
// shop per deployment so it always resolves to the same Store, but every query
// is already scoped by it — which is what makes the move to multi-tenant a
// configuration change rather than a migration of every collection.
const OnlineCategorySchema = new mongoose.Schema(
  {
    store: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true, index: true },

    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, default: "" },
    // Cloudinary URL for the category tile.
    image: { type: String, default: "" },

    // Merchandising order on the storefront; lower shows first.
    sortWeight: { type: Number, default: 0 },
    // Hidden rather than deleted, so a category can be pulled from the site
    // without orphaning the listings that point at it.
    active: { type: Boolean, default: true },

    // Optional provenance for catalogue imports. Manual categories simply
    // leave this empty and continue to work exactly as before.
    source: {
      provider: { type: String, trim: true, lowercase: true, default: "" },
      storeDomain: { type: String, trim: true, lowercase: true, default: "" },
      externalId: { type: String, trim: true, default: "" },
      handle: { type: String, trim: true, default: "" },
    },
  },
  { timestamps: true }
);

// Slugs are the storefront's URLs, so they must be unique within a shop.
OnlineCategorySchema.index({ store: 1, slug: 1 }, { unique: true });
OnlineCategorySchema.index({ store: 1, active: 1, sortWeight: 1 });

module.exports = mongoose.model("OnlineCategory", OnlineCategorySchema);
