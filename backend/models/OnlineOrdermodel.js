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

    status: {
      type: String,
      enum: [
        "pending_payment",
        "paid",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      default: "pending_payment",
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
OnlineOrderSchema.index({ store: 1, status: 1, createdAt: -1 });
OnlineOrderSchema.index({ clientRef: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("OnlineOrder", OnlineOrderSchema);
