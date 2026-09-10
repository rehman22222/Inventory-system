const mongoose = require("mongoose");
const { archivable } = require("../libs/archivable");

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
    // Taken back against old accounts on this shift. In the drawer, but not a
    // sale — the goods left on the day the account was opened.
    creditRepaid: { type: Number },
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
    /* Set only when an archive has restated this closing.
     *
     * A closing is stored rather than derived because it is the record of a
     * shift somebody handed over and signed for — recomputing it later from
     * today's rules would quietly restate what they signed. Archiving sales out
     * of a closed day makes a recount unavoidable, so it happens LOUDLY
     * instead: the figures that were signed for are kept here beside who
     * restated them and which archive did it, and the screens say so.
     *
     * Absent on every closing that has never been touched, which is nearly all
     * of them. */
    adjusted: {
      at: { type: Date },
      by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      byName: { type: String },
      batch: { type: String },
      reason: { type: String },
      // The signed-for figures, exactly as they stood. Written once, on the
      // first restatement, so a second archive against the same day cannot
      // overwrite the original with an already-adjusted one.
      was: {
        _id: false,
        receiptCount: { type: Number },
        gross: { type: Number },
        discount: { type: Number },
        tax: { type: Number },
        net: { type: Number },
        refunded: { type: Number },
        grossSales: { type: Number },
        refundAmount: { type: Number },
        netSales: { type: Number },
        expectedCash: { type: Number },
        expectedCard: { type: Number },
      },
    },
  },
  { timestamps: true }
);

// The admin list is always "newest first, optionally per cashier".
DayClosingSchema.index({ closedAt: -1 });
DayClosingSchema.index({ cashier: 1, closedAt: -1 });

/* A closing can be archived too, and for one reason only: when every sale it
 * counted has been archived out from under it, what is left is a day that
 * says nothing happened — which is not what happened, and not something the
 * shop should have to scroll past.
 *
 * Archived rather than deleted, like everything else in this feature, so
 * putting the sales back puts the day back with them. See libs/archivable.js. */
archivable(DayClosingSchema);

const DayClosing = mongoose.model("DayClosing", DayClosingSchema);

module.exports = DayClosing;
