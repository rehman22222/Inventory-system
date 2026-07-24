const mongoose = require("mongoose");

const OnlineVoucherSchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      required: true,
    },
    value: { type: Number, required: true, min: 0.01 },
    minSpend: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: null, min: 0 },
    scope: {
      type: String,
      enum: ["entire_order", "specific_products", "specific_categories"],
      default: "entire_order",
    },
    listings: [{ type: mongoose.Schema.Types.ObjectId, ref: "OnlineListing" }],
    categories: [
      { type: mongoose.Schema.Types.ObjectId, ref: "OnlineCategory" },
    ],
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    usageLimit: { type: Number, default: null, min: 1 },
    perCustomerLimit: { type: Number, default: null, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

OnlineVoucherSchema.index({ store: 1, code: 1 }, { unique: true });
OnlineVoucherSchema.index({ store: 1, active: 1, startsAt: 1, endsAt: 1 });

module.exports = mongoose.model("OnlineVoucher", OnlineVoucherSchema);
