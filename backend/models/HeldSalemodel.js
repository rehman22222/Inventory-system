const mongoose = require("mongoose");

// A suspended (parked) sale. Stored server-side so a basket suspended on one
// till can be resumed on another.
const HeldSaleSchema = new mongoose.Schema(
  {
    till: { type: String, default: "TERMINAL-MAIN" },
    cashier: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cashierName: { type: String },
    customerName: { type: String, default: "Walk-in Customer" },

    items: [
      {
        _id: false,
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        name: { type: String },
        barcode: { type: String },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
      },
    ],

    discount: { type: Number, default: 0 },
    discountType: { type: String, enum: ["amount", "percent"], default: "amount" },
    taxEnabled: { type: Boolean, default: false },
    voucherCode: { type: String },
  },
  { timestamps: true }
);

// A parked sale is only meant to be resumed shortly. Expire it automatically 30
// minutes after it was suspended so stale baskets don't pile up — MongoDB's TTL
// monitor removes them (within ~a minute of expiry). Resuming deletes it too;
// this just cleans up the ones nobody comes back for.
HeldSaleSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 60 });

const HeldSale = mongoose.model("HeldSale", HeldSaleSchema);

module.exports = HeldSale;
