const mongoose = require("mongoose");

// A "meal-deal"-style bundle: buy this set of products together and take a
// fixed amount off. The till detects it automatically as the items land in the
// basket and shows a DEAL badge.
const DealItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    // How many of this product a single set of the deal needs.
    quantity: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const DealSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // How much comes off per complete set present: either a fixed amount in the
    // shop's currency, or a percentage of the deal's own products.
    discount: { type: Number, required: true, min: 0 },
    discountType: { type: String, enum: ["amount", "percent"], default: "amount" },
    items: {
      type: [DealItemSchema],
      validate: {
        validator: (items) =>
          Array.isArray(items) &&
          items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0) >= 2,
        message: "A deal needs at least two product units",
      },
    },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const Deal = mongoose.model("Deal", DealSchema);

module.exports = Deal;
