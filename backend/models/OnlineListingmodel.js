const mongoose = require("mongoose");

// The shop window for one product.
//
// The rule this model exists to enforce: a listing NEVER carries stock. It
// points at a Product and that Product's `quantity` is the single number the
// till, the back office and the website all read and decrement. Selling online
// therefore moves the same figure the counter moves — there is nothing to sync
// because there is nothing duplicated.
//
// What a listing does own is the storefront presentation: a marketing name, a
// gallery, specs, SEO — the things a POS record has no business holding.
const OnlineListingSchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },

    // The shared source of stock and base price.
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OnlineCategory",
      default: null,
    },
    // A product may appear in more than one Shopify collection. `category`
    // remains the primary category for backwards compatibility and admin
    // editing; `categories` powers every matching collection page.
    categories: [
      { type: mongoose.Schema.Types.ObjectId, ref: "OnlineCategory" },
    ],

    // Optional flavour/size choices. Each choice points at the real inventory
    // Product that owns its quantity. The parent `product` above remains the
    // catalogue master; an online order for a variant decrements the selected
    // Product, never the parent placeholder.
    variants: [
      {
        _id: false,
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        label: { type: String, required: true, trim: true },
        // What axis this option belongs to, so the storefront can group and
        // label "Flavour" choices separately from "Colour" choices. "option" is
        // the neutral fallback used by legacy/imported listings.
        kind: {
          type: String,
          enum: ["flavour", "colour", "option"],
          default: "option",
        },
        priceOverride: { type: Number, default: null, min: 0 },
        image: { type: String, default: "" },
        imageAlt: { type: String, default: "", trim: true, maxlength: 160 },
        externalId: { type: String, trim: true, default: "" },
      },
    ],
    // Optional product-family choices. This lets one storefront product page
    // present linked listings as variants (e.g. 2ml / 3ml), while each linked
    // listing can still own its own flavour/colour options and shared stock.
    variantLabel: { type: String, trim: true, default: "" },
    selfVariantLabel: { type: String, trim: true, default: "" },
    linkedListings: [
      {
        _id: false,
        listing: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "OnlineListing",
          required: true,
        },
        label: { type: String, required: true, trim: true },
        image: { type: String, default: "" },
        imageAlt: { type: String, default: "", trim: true, maxlength: 160 },
        sortWeight: { type: Number, default: 0 },
      },
    ],

    // The admin's on/off switch. Only `listed` products reach the storefront.
    listed: { type: Boolean, default: false },

    slug: { type: String, required: true, trim: true, lowercase: true },
    webName: { type: String, trim: true, default: "" },
    brand: { type: String, trim: true, default: "" },
    shortDescription: { type: String, default: "" },
    description: { type: String, default: "" },

    // Web photography, uploaded separately from the product's till image —
    // publicId is kept so replacing a picture can clean the old asset up.
    gallery: [
      {
        _id: false,
        url: { type: String, required: true },
        publicId: { type: String, default: "" },
        alt: { type: String, default: "" },
      },
    ],
    // Optional catalogue/listing-card cover. This is intentionally separate
    // from the product detail gallery, so a combined family image can appear in
    // grids/search without replacing the real product or selected variant photo.
    catalogImage: {
      url: { type: String, default: "" },
      publicId: { type: String, default: "" },
      alt: { type: String, default: "" },
    },

    // Free-form spec sheet, e.g. { "Battery": "1200 mAh", "Coil": "0.8 ohm" }.
    specs: { type: Map, of: String, default: {} },
    flavour: { type: String, default: "" },
    optionLabel: { type: String, trim: true, default: "" },
    tags: [{ type: String, enum: ["new", "bestseller", "sale", "limited", "hot"] }],

    // Online pricing is allowed to differ from the shelf price; stock is not.
    // null means "use the product's price".
    priceOverride: { type: Number, default: null, min: 0 },
    // Struck-through reference price, display only.
    compareAtPrice: { type: Number, default: null, min: 0 },
    // Optional web-only promotion. These fields deliberately live on the
    // listing: changing a website sale never changes Product.Price at the POS.
    salePrice: { type: Number, default: null, min: 0 },
    saleStartsAt: { type: Date, default: null },
    saleEndsAt: { type: Date, default: null },
    // A quantity-triggered deal: the salePrice only applies once the shopper
    // takes at least this many of the product ("buy 3+, €X each"). null or 1
    // means the deal applies to every unit — an ordinary sale.
    dealMinQty: { type: Number, default: null, min: 1 },
    // Optional promotional image the shop uploads for the deal, shown on the
    // product page beside the offer. Presentation only; publicId lets a replaced
    // image clean up its old Cloudinary asset.
    dealImage: {
      url: { type: String, default: "" },
      publicId: { type: String, default: "" },
      alt: { type: String, default: "", trim: true, maxlength: 160 },
    },

    seo: {
      title: { type: String, default: "" },
      description: { type: String, default: "" },
    },

    featured: { type: Boolean, default: false },
    sortWeight: { type: Number, default: 0 },

    source: {
      provider: { type: String, trim: true, lowercase: true, default: "" },
      storeDomain: { type: String, trim: true, lowercase: true, default: "" },
      externalId: { type: String, trim: true, default: "" },
      handle: { type: String, trim: true, default: "" },
      url: { type: String, trim: true, default: "" },
    },
  },
  { timestamps: true },
);

// One listing per product per shop — a product cannot be on the site twice.
OnlineListingSchema.index({ store: 1, product: 1 }, { unique: true });
OnlineListingSchema.index({ store: 1, slug: 1 }, { unique: true });
OnlineListingSchema.index({ product: 1 });
OnlineListingSchema.index({ "variants.product": 1 });
// The storefront's main read: what is live, in order.
OnlineListingSchema.index({ store: 1, listed: 1, sortWeight: 1 });
OnlineListingSchema.index({ store: 1, category: 1, listed: 1 });
OnlineListingSchema.index({ store: 1, categories: 1, listed: 1 });
OnlineListingSchema.index({
  store: 1,
  "source.provider": 1,
  "source.storeDomain": 1,
  "source.externalId": 1,
});

module.exports = mongoose.model("OnlineListing", OnlineListingSchema);
