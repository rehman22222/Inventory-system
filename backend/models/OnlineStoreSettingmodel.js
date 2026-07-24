const mongoose = require("mongoose");

const OnlineStoreSettingSchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      unique: true,
      index: true,
    },
    social: {
      instagram: { type: String, default: "", trim: true },
      facebook: { type: String, default: "", trim: true },
      twitter: { type: String, default: "", trim: true },
      tiktok: { type: String, default: "", trim: true },
    },
    footer: {
      description: {
        type: String,
        default:
          "Premium vape products, trusted flavours and reliable service from Candy Cloud Vape.",
        trim: true,
      },
      supportEmail: { type: String, default: "", trim: true, lowercase: true },
      supportPhone: { type: String, default: "", trim: true },
      address: { type: String, default: "", trim: true },
    },
    announcement: {
      primary: {
        type: String,
        default: "Free shipping over €50 · Same-day dispatch",
        trim: true,
      },
      secondary: {
        type: String,
        default: "21+ only · Nicotine warning",
        trim: true,
      },
    },
    newThisWeek: {
      enabled: { type: Boolean, default: true },
      eyebrow: {
        type: String,
        default: "Fresh drops",
        trim: true,
        maxlength: 80,
      },
      title: {
        type: String,
        default: "New this week.",
        trim: true,
        maxlength: 120,
      },
      subtitle: {
        type: String,
        default:
          "The latest products to land in store, selected by the Candy Cloud team.",
        trim: true,
        maxlength: 300,
      },
      limit: { type: Number, default: 8, min: 4, max: 12 },
    },
    deals: {
      enabled: { type: Boolean, default: true },
      eyebrow: {
        type: String,
        default: "Live sale",
        trim: true,
        maxlength: 80,
      },
      title: {
        type: String,
        default: "Weekly deals.",
        trim: true,
        maxlength: 120,
      },
      subtitle: {
        type: String,
        default:
          "Limited-time online prices selected by the Candy Cloud team. Stock updates from the same inventory used at the till.",
        trim: true,
        maxlength: 300,
      },
      ctaLabel: {
        type: String,
        default: "See the deals",
        trim: true,
        maxlength: 40,
      },
      limit: { type: Number, default: 4, min: 2, max: 8 },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("OnlineStoreSetting", OnlineStoreSettingSchema);
