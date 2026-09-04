const mongoose = require("mongoose");

// An order placed on the website.
//
// Kept in its own collection rather than forced into the POS `Receipt` shape:
// an online order has a customer, an address and a fulfilment lifecycle that a
// counter sale never has. It still writes a `Sale` row with source "online" so
// the shop's existing sales reporting sees POS and web takings in one ledger.
const OnlineOrderItemSchema = new mongoose.Schema(
  {
    _id: false,
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OnlineListing",
      default: null,
    },
    // Snapshot — the record still reads correctly if the catalogue changes.
    name: { type: String, required: true },
    brand: { type: String, default: "" },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, default: 0 },
    discount: { type: Number, required: true, default: 0 },
    lineTotal: { type: Number, required: true },
  },
  { _id: false },
);

const OnlineOrderSchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },

    orderNo: { type: String, required: true, unique: true },
    items: { type: [OnlineOrderItemSchema], required: true },

    customer: {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
      phone: { type: String, default: "", trim: true },
      // The website account this was placed from, when the shopper was signed
      // in. Null on a guest checkout, which stays a first-class way to buy —
      // an account is something the shop offers, never something it demands
      // before it will take money.
      //
      // The name/email/phone above remain a SNAPSHOT of what was typed at
      // checkout. A customer who later changes their name on their profile has
      // not changed who this parcel was addressed to.
      account: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "OnlineCustomer",
        default: null,
      },
    },
    shippingAddress: {
      line1: { type: String, default: "" },
      line2: { type: String, default: "" },
      city: { type: String, default: "" },
      region: { type: String, default: "" },
      postcode: { type: String, default: "" },
      country: { type: String, default: "" },
    },

    subtotal: { type: Number, default: 0 },
    shipping: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },

    // Immutable voucher snapshot. Reports remain auditable after a promotion
    // is renamed, disabled or deleted.
    voucher: {
      id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "OnlineVoucher",
        default: null,
      },
      code: { type: String, default: "" },
      name: { type: String, default: "" },
      discountType: {
        type: String,
        enum: ["", "percentage", "fixed"],
        default: "",
      },
      value: { type: Number, default: 0 },
    },
    // Guards usage-counter restoration on cancelled/refunded orders.
    voucherReleasedAt: { type: Date, default: null },

    payment: {
      provider: { type: String, default: "manual" },
      // Shown at checkout as "Pick & Pay". The stored value predates that
      // name and is deliberately left alone: changing it would strand every
      // order already written with it.
      method: {
        type: String,
        enum: ["", "cash_on_delivery"],
        default: "",
      },
      reference: { type: String, default: "" },
      status: {
        type: String,
        enum: ["unpaid", "paid", "refunded", "failed"],
        default: "unpaid",
      },
    },

    // Where the order has got to. This is the ONE field the customer's tracker
    // reads, so the names matter as much as the mechanics:
    //
    //   processing — we have it, we are picking it
    //   ready      — packed and waiting to go out
    //   shipped    — it has left us  (shown as "Dispatched")
    //   delivered  — it arrived
    //
    // "ready" was added when the shop asked to show a real fulfilment cycle to
    // the shopper. Everything written before it simply never passed through
    // that step, which reads correctly — an order that went straight from
    // processing to shipped genuinely never sat on the packing bench.
    status: {
      type: String,
      enum: [
        "pending_payment",
        "paid",
        "processing",
        "ready",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      default: "pending_payment",
    },

    // Every step this order has actually taken, in the order it took them.
    //
    // The status field alone tells a customer where their order IS. It cannot
    // tell them when it got there, and "when did you say it was dispatched?"
    // is the question support actually gets. Appended to on every transition,
    // never rewritten — a fulfilment history that can be edited is not one.
    timeline: [
      {
        _id: false,
        status: { type: String, required: true },
        at: { type: Date, default: Date.now },
        // Who moved it. Absent when the system did it itself (the order being
        // placed, an automatic cancellation).
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        byName: { type: String, default: "" },
        // Optional shop note. Shown to the customer, so it is written for them
        // — "held for the weekend, going out Monday", not an internal code.
        note: { type: String, default: "", maxlength: 300 },
      },
    ],

    // Filled in when the order is dispatched, if the shop tracks that leg.
    // All optional: a shop delivering by hand in its own van has nothing to
    // put here and should not be made to invent it.
    tracking: {
      carrier: { type: String, default: "", trim: true, maxlength: 80 },
      number: { type: String, default: "", trim: true, maxlength: 120 },
      url: { type: String, default: "", trim: true, maxlength: 500 },
      // What the shop tells the customer to expect. Free text on purpose —
      // "Tuesday" is a more useful promise than a date nobody can commit to.
      estimate: { type: String, default: "", trim: true, maxlength: 120 },
    },

    /* ── Loyalty ──────────────────────────────────────────────────────────
     * What this order did to the shopper's points. The ledger
     * (OnlineLoyaltyEntry) holds the movements; these are the order's own
     * summary of them, so an order can be read on its own and so the guards
     * below can be idempotent.
     *
     *   earned         — points the basket generated, pending until delivery
     *   redeemed       — points spent to discount THIS order, taken at once
     *   redeemedValue  — what those points came off the total, in currency
     * ------------------------------------------------------------------- */
    loyalty: {
      earned: { type: Number, default: 0, min: 0 },
      redeemed: { type: Number, default: 0, min: 0 },
      redeemedValue: { type: Number, default: 0, min: 0 },
      // Stamped when the pending earning became spendable. Guards against a
      // retried "mark delivered" paying somebody twice.
      confirmedAt: { type: Date, default: null },
      // Stamped when a cancellation took the earning back and handed any
      // redemption back. Guards the same way, in the other direction.
      reversedAt: { type: Date, default: null },
    },

    // Idempotency. Stock comes off exactly once however many times a payment
    // webhook fires or a client retries — the same guarantee the offline till
    // sync relies on.
    stockDecrementedAt: { type: Date, default: null },
    // Written in the same transaction that puts cancelled/refunded quantities
    // back. A retry therefore cannot restore the same stock twice.
    stockRestoredAt: { type: Date, default: null },
    clientRef: { type: String, default: null },

    // The Sale ledger row written when payment is collected (on delivery for
    // Pick & Pay), so reports and the order can always be reconciled against
    // each other.
    sale: { type: mongoose.Schema.Types.ObjectId, ref: "Sale", default: null },
    sales: [{ type: mongoose.Schema.Types.ObjectId, ref: "Sale" }],
    refundRecordedAt: { type: Date, default: null },

    note: { type: String, default: "" },
    failureReason: { type: String, default: "" },

    // Minted once when the order is first marked delivered. It is the secret in
    // the "review your purchase" email link, so only the person who received
    // the order can leave a review for it.
    reviewToken: { type: String, default: null },
    reviewRequestedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

OnlineOrderSchema.index({ store: 1, createdAt: -1 });
// A signed-in shopper's own order history — the read behind /account/orders.
OnlineOrderSchema.index({ "customer.account": 1, createdAt: -1 });
// Matching a guest order to an account by the email it was placed with, so a
// customer who checked out before signing up still sees their history.
OnlineOrderSchema.index({ store: 1, "customer.email": 1, createdAt: -1 });
OnlineOrderSchema.index({ store: 1, status: 1, createdAt: -1 });
OnlineOrderSchema.index({ clientRef: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("OnlineOrder", OnlineOrderSchema);
