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
    // The part of `refunded` that was spent on a replacement instead of being
    // handed back. Cash actually out of the drawer is refunded minus this.
    exchangeCredit: { type: Number, default: 0 },

    // Three different questions, three different answers. `net` above is the
    // sales total BEFORE refunds and always has been — it was being read as
    // "what was handed over", which overstated a shift with any refund in it.
    //
    // grossSales   what the sales were worth
    // netSales     what the shop kept: grossSales - refundAmount
    // expectedCash what should physically be in the drawer
    // expectedCard what the terminal should show
    //
    // No default: absent means a closing from before these were recorded, and
    // a stored zero would read as "handed over nothing" rather than "not
    // measured". The screens fall back to the old fields when they are missing.
    grossSales: { type: Number },
    refundAmount: { type: Number },
    netSales: { type: Number },
    // What actually crossed the counter, as opposed to what was refunded on
    // paper: refundAmount minus the part spent on exchanges.
    cashHandedBack: { type: Number },
    expectedCash: { type: Number },
    expectedCard: { type: Number },

    byMethod: [
      {
        _id: false,
        method: { type: String },
        // Taken in on this method. Unchanged meaning.
        amount: { type: Number, default: 0 },
        count: { type: Number, default: 0 },
        // Handed back on it, and what should be left. A card sale refunded in
        // cash moves this method's `refunded`, not the card's.
        refunded: { type: Number },
        expected: { type: Number },
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
