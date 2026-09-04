const mongoose = require("mongoose");

// One movement of loyalty points. This collection is the TRUTH; the balance on
// the customer record is a cache of it.
//
// Points are money the shop has promised. That makes "how did I get 340
// points?" a question the shop must be able to answer exactly, months later,
// to a customer who is standing in front of them disagreeing. A running total
// cannot answer it. A ledger can, and it is also the only way to undo one
// movement — a cancelled order — without recomputing everything.
//
// Rows are append-only. A mistake is corrected by writing the opposite row,
// never by editing or deleting history.

const OnlineLoyaltyEntrySchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OnlineCustomer",
      required: true,
    },

    kind: {
      type: String,
      enum: [
        // Earned by buying. Starts `pending` and is confirmed on delivery.
        "earn",
        // Spent at checkout for a discount.
        "redeem",
        // Given back because a redeemed order was cancelled or refunded.
        "refund",
        // Taken back because an earning order was cancelled or refunded.
        "reverse",
        // The shop moving somebody's balance by hand, for any reason. Always
        // carries who did it and why.
        "adjust",
        // A welcome bonus, a review thank-you, a birthday — anything the
        // program gives that is not tied to a basket's value.
        "bonus",
        // Aged out under the program's expiry rule.
        "expire",
      ],
      required: true,
    },

    // Signed: positive adds, negative takes away. Always a whole number —
    // fractional loyalty points are a rounding argument nobody wins.
    points: { type: Number, required: true },

    // `pending` earnings are shown to the customer as "on the way" and are NOT
    // spendable. Confirmed on delivery, reversed if the order never completes.
    // Everything that is not an earning is written `confirmed` straight away.
    status: {
      type: String,
      enum: ["pending", "confirmed", "reversed", "expired"],
      default: "confirmed",
    },

    // The confirmed balance immediately after this row was applied. Recorded so
    // a statement reads like a bank statement rather than a list of deltas the
    // reader has to add up themselves. Only meaningful on confirmed rows.
    balanceAfter: { type: Number, default: 0 },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OnlineOrder",
      default: null,
    },
    orderNo: { type: String, default: "" },

    // What the customer is shown. Written at the time, in plain words, because
    // the rule that produced it may be edited or deleted next week and the
    // statement still has to make sense.
    reason: { type: String, default: "", maxlength: 300 },

    // The per-line workings behind an earning, kept so the shop can answer
    // "why did that item only give me 4 points?" without re-deriving it from
    // rules that may since have changed.
    breakdown: [
      {
        _id: false,
        name: { type: String, default: "" },
        listing: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "OnlineListing",
          default: null,
        },
        rule: { type: String, default: "" },
        amount: { type: Number, default: 0 },
        points: { type: Number, default: 0 },
      },
    ],

    // The cash value this movement was worth, for a redemption. Stored because
    // the redemption rate is a setting and settings change.
    value: { type: Number, default: 0 },

    // Staff member, on an `adjust`. Null on anything the system did itself.
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    byName: { type: String, default: "" },

    // When a pending earning became real, or was written off.
    settledAt: { type: Date, default: null },
    // When these points stop being spendable, if the program expires them.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The customer's own statement, newest first.
OnlineLoyaltyEntrySchema.index({ customer: 1, createdAt: -1 });
// Confirming or reversing every row an order produced.
OnlineLoyaltyEntrySchema.index({ order: 1, kind: 1 });
// The expiry sweep: pending rows waiting on delivery, confirmed rows ageing out.
OnlineLoyaltyEntrySchema.index({ store: 1, status: 1, expiresAt: 1 });

module.exports = mongoose.model("OnlineLoyaltyEntry", OnlineLoyaltyEntrySchema);
