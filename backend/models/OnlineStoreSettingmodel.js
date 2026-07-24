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
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("OnlineStoreSetting", OnlineStoreSettingSchema);
