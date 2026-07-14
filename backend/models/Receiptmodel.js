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
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    byName: { type: String },
    reason: { type: String },
    amount: { type: Number, default: 0 },
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

    items: [ReceiptItemSchema],

    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    discountType: { type: String, enum: ["amount", "percent"], default: "amount" },
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
          enum: ["cash", "creditcard", "banktransfer", "easypaisa", "jazzcash"],
          required: true,
        },
        amount: { type: Number, required: true },
      },
    ],
    paymentMethod: {
      type: String,
      enum: ["cash", "creditcard", "banktransfer", "easypaisa", "jazzcash", "split"],
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

    saleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Sale" }],
  },
  { timestamps: true }
);

const Receipt = mongoose.model("Receipt", ReceiptSchema);

module.exports = Receipt;
