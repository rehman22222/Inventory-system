const mongoose = require("mongoose");

// A cashier's end-of-day cash-up (the "Z report" on a real till).
//
// Closing the day hands that cashier's takings over to the admin: every receipt
// in the batch is stamped with this closing's id, which removes it from the
// cashier's own sale history. The snapshot below is what the admin reviews, so
// it is deliberately stored rather than recomputed — later refunds against a
// closed receipt must not silently rewrite what was handed over.
const DayClosingSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },

    cashier: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    cashierName: { type: String },
    cashierRole: { type: String },

    // The trading window this batch covers: first open receipt → close time.
    openedAt: { type: Date },
    closedAt: { type: Date, default: Date.now },

    receiptCount: { type: Number, default: 0 },
    receiptNos: [{ type: String }],
    receipts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Receipt" }],

    // Money, as it stood at the moment of closing.
    gross: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    net: { type: Number, default: 0 },
    refunded: { type: Number, default: 0 },

    byMethod: [
      {
        _id: false,
        method: { type: String },
        amount: { type: Number, default: 0 },
        count: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true }
);

// The admin list is always "newest first, optionally per cashier".
DayClosingSchema.index({ closedAt: -1 });
DayClosingSchema.index({ cashier: 1, closedAt: -1 });

const DayClosing = mongoose.model("DayClosing", DayClosingSchema);

module.exports = DayClosing;
