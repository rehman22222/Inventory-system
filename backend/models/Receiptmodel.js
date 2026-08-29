const mongoose = require("mongoose");

// A Receipt is the source of truth for one POS transaction (the whole basket).
// The per-line Sale documents are still written for the existing sales/report
// screens, and are linked back here via saleIds.
const ReceiptItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String },
    barcode: { type: String },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
  },
  { _id: false }
);

const RefundEntrySchema = new mongoose.Schema(
  {
    // The refund's own number, quoted the way a receipt number is. Sequential
    // and independent of the receipt, because one receipt can be refunded more
    // than once and "the refund on POS-000036" stops identifying anything the
    // second time it happens.
    reference: { type: String },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    byName: { type: String },
    reason: { type: String },
    // How the money actually went back. Not always how it came in: a card sale
    // handed back in cash is an ordinary thing at a counter, and the drawer
    // needs to know which it was.
    method: { type: String, enum: ["cash", "creditcard", "credit", "wallet"] },
    // Whether the goods went back on the shelf. Expired and damaged stock is
    // refunded and written off; anything else is resellable. No default: rows
    // written before this existed all restocked, and saying so outright would
    // be claiming a decision nobody made.
    restocked: { type: Boolean },
    amount: { type: Number, default: 0 },
    // On an exchange the money does not leave the drawer — it pays for what the
    // customer took instead. This is how much of `amount` is being held for
    // that, so the takings can tell "handed back" from "spent here"; `method`
    // then describes only the rest.
    exchangeCredit: { type: Number, default: 0 },
    // The sale that spent it, by receipt number. Set once and checked before
    // spending, so one refund cannot pay for two baskets.
    creditReceiptNo: { type: String, default: null },
    items: [
      {
        _id: false,
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        name: { type: String },
        quantity: { type: Number },
        lineTotal: { type: Number },
      },
    ],
  },
  { _id: false }
);

const ReceiptSchema = new mongoose.Schema(
  {
    receiptNo: { type: String, required: true, unique: true },
    cashier: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cashierName: { type: String },
    customerName: { type: String, default: "Walk-in Customer" },

    // Sold on account. The goods went and the money did not, so this is the
    // shop's side of a debt: who owes it, when it is due, and what has come
    // back against it since.
    //
    // Absent on an ordinary sale — a receipt with no credit block was paid for
    // at the counter and there is nothing to chase.
    credit: {
      // How the customer is found again. One of these is required at the till
      // when a sale goes on account: a debt owed by "Walk-in Customer" with no
      // way to reach them is not a debt, it is a loss.
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String, trim: true },

      // What was put on account. Not the receipt total: a customer can pay
      // half in cash and put the rest on the book.
      amount: { type: Number, default: 0 },

      // The agreed run, in days, and the date it falls due. Both stored: the
      // term is what was agreed and the date is what is chased, and working
      // one back from the other later would use today's calendar rather than
      // the one the customer was standing in.
      termDays: { type: Number },
      dueAt: { type: Date },

      // Money that has come back against it. Each entry is real money in the
      // drawer on the day it was taken, which is why it carries its own method
      // and cashier — the day it is repaid is not the day it was sold.
      payments: [
        {
          _id: false,
          at: { type: Date, default: Date.now },
          amount: { type: Number, required: true },
          method: { type: String, enum: ["cash", "creditcard", "wallet"] },
          by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          byName: { type: String },
          reference: { type: String },
          // Stamped when the cashier hands their day over, exactly like a
          // receipt: a repayment belongs to the shift that took it.
          dayClosing: { type: mongoose.Schema.Types.ObjectId, ref: "DayClosing", default: null },
        },
      ],

      settledAt: { type: Date },
    },

    items: [ReceiptItemSchema],

    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    discountType: { type: String, enum: ["amount", "percent"], default: "amount" },

    // The offers the cashier gave on this basket. dealDiscount is the portion
    // of `discount` that came from them.
    dealDiscount: { type: Number, default: 0 },
    deals: [
      {
        _id: false,
        dealId: { type: mongoose.Schema.Types.ObjectId, ref: "Deal" },
        name: { type: String },
        sets: { type: Number, default: 1 },
        amount: { type: Number, default: 0 },
        // Which units the offer actually covered. Five items on a 3-for deal
        // are three at the deal and two at shelf price, and a customer reading
        // this back has to be able to see which were which.
        items: [
          {
            _id: false,
            product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
            name: { type: String },
            quantity: { type: Number },
          },
        ],
      },
    ],
    voucher: {
      code: { type: String },
      voucherId: { type: mongoose.Schema.Types.ObjectId, ref: "Voucher" },
      amount: { type: Number, default: 0 },
    },

    taxEnabled: { type: Boolean, default: false },
    taxRate: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },

    total: { type: Number, default: 0 },

    // A customer paying €50 with €30 cash and €20 on card produces two entries
    // here; paymentMethod is then "split".
    payments: [
      {
        _id: false,
        method: {
          type: String,
          // "wallet" covers digital/online tenders (Apple Pay, Google Pay,
          // Revolut). "refund" is not a tender the cashier can pick — it is
          // credit from a return being spent on the replacement, and it is
          // recorded as a payment so the sale keeps its real value while the
          // drawer sees nothing come in.
          enum: ["cash", "creditcard", "credit", "wallet", "refund"],
          required: true,
        },
        amount: { type: Number, required: true },
      },
    ],
    paymentMethod: {
      type: String,
      enum: ["cash", "creditcard", "credit", "wallet", "refund", "split"],
      required: true,
    },
    amountTendered: { type: Number },
    changeDue: { type: Number },

    status: {
      type: String,
      enum: ["completed", "voided", "partially-refunded", "refunded"],
      default: "completed",
    },
    refunds: [RefundEntrySchema],

    // Set once the cashier closes their day. Unset (null) means the receipt is
    // still on that cashier's own sale history; stamped means it has been
    // handed over to the admin and no longer shows for the cashier.
    dayClosing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DayClosing",
      default: null,
    },

    // Rung up while the till had no network, then synced.
    //
    // `clientRef` is generated by the till and is what makes syncing safe to
    // retry: a receipt already carrying it is never written twice, so a flaky
    // connection can replay the queue without charging the customer again.
    //
    // The customer's printed receipt shows `offline.ref`, so a refund must be
    // findable by that as well as by the sequential receiptNo assigned here.
    offline: {
      clientRef: { type: String },
      ref: { type: String },
      soldAt: { type: Date },
      syncedAt: { type: Date },
      // Anything the server would have done differently had it been online.
      // Surfaced to the admin rather than silently "corrected", because the
      // goods and the printed receipt are already out of the shop.
      flags: [
        {
          _id: false,
          type: {
            type: String,
            enum: ["negative-stock", "price-changed", "deal-changed", "voucher-spent"],
          },
          product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
          name: { type: String },
          detail: { type: String },
        },
      ],
    },

    saleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Sale" }],
  },
  { timestamps: true }
);

// Idempotency key for offline sync: at most one receipt per till-generated ref.
// Sparse, because online sales have no clientRef at all.
ReceiptSchema.index(
  { "offline.clientRef": 1 },
  { unique: true, sparse: true }
);
ReceiptSchema.index({ "offline.ref": 1 }, { sparse: true });
// Ghost/report exports commonly slice a full trading year by date, then narrow
// by cashier or status. These indexes keep those reads bounded without touching
// the immutable receipt records.
ReceiptSchema.index({ createdAt: -1 });
ReceiptSchema.index({ cashier: 1, createdAt: -1 });
ReceiptSchema.index({ status: 1, createdAt: -1 });
// Chasing a debt: found by the contact the customer left, and listed by what
// is still outstanding. Sparse, because most receipts carry no credit at all.
ReceiptSchema.index({ "credit.email": 1 }, { sparse: true });
ReceiptSchema.index({ "credit.phone": 1 }, { sparse: true });
ReceiptSchema.index({ "credit.settledAt": 1, "credit.dueAt": 1 }, { sparse: true });

const Receipt = mongoose.model("Receipt", ReceiptSchema);

module.exports = Receipt;
