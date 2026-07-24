const mongoose = require("mongoose");

// One poster in the storefront's hero carousel.
//
// These were hardcoded in the site's source, which meant a seasonal offer
// needed a developer and a redeploy. Holding them here lets the owner run a
// sale from the admin — add a slide, reorder it, switch it off when it ends.
const OnlineHeroSlideSchema = new mongoose.Schema(
  {
    store: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true, index: true },

    // Headline is built from four parts so it can stay typographic:
    //   titleTop / titleItalic / titleBadge / titleBottom
    eyebrow: { type: String, default: "" },
    titleTop: { type: String, required: true, trim: true },
    titleItalic: { type: String, default: "" },
    titleBadge: { type: String, default: "" },
    titleBottom: { type: String, default: "" },
    copy: { type: String, default: "" },

    ctaPrimary: {
      label: { type: String, default: "Shop now" },
      to: { type: String, default: "/shop" },
      params: { type: Map, of: String, default: {} },
    },
    ctaSecondary: {
      label: { type: String, default: "" },
      to: { type: String, default: "" },
      params: { type: Map, of: String, default: {} },
    },

    // The product shown in the showcase card. Optional — a slide can be pure
    // promotion. When set, price and stock are read live from the Product.
    listing: { type: mongoose.Schema.Types.ObjectId, ref: "OnlineListing", default: null },

    image: { type: String, default: "" },
    imageAlt: { type: String, default: "" },

    // The rotated corner badge: { top: "Save", big: "40%", bottom: "this week" }
    burst: {
      top: { type: String, default: "" },
      big: { type: String, default: "" },
      bottom: { type: String, default: "" },
    },

    tone: { type: String, enum: ["cream", "ink", "accent"], default: "ink" },

    active: { type: Boolean, default: true },
    sortWeight: { type: Number, default: 0 },
  },
  { timestamps: true }
);

OnlineHeroSlideSchema.index({ store: 1, active: 1, sortWeight: 1 });

module.exports = mongoose.model("OnlineHeroSlide", OnlineHeroSlideSchema);
