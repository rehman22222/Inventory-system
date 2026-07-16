const mongoose = require("mongoose");

const SaleSchema = new mongoose.Schema(
  {
    customerName: { type: String, required: true },
    receiptNo: { type: String },
    cashier: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cashierName: { type: String },
    products: 
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        quantity: { type: Number, required: true },
        price: { type: Number, required: true },
      },
    
    totalAmount: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    reportOverride: {
      previousTotalAmount: { type: Number },
      previousUnitPrice: { type: Number },
      targetReportTotal: { type: Number },
      factor: { type: Number },
      reason: { type: String },
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      changedByName: { type: String },
      changedAt: { type: Date },
    },
    paymentStatus: { type: String, enum: ["pending", "paid"], default: "pending" },
    // "split" means the receipt was settled with more than one tender; the
    // breakdown lives on the Receipt.
    // "wallet" covers digital/online tenders (Apple Pay, Google Pay, Revolut).
    paymentMethod: { type: String, enum: ["cash", "creditcard", "wallet", "split"], required: true },
    invoiceUrl: { type: String },
    // Stamped when the cashier closes their day, mirroring Receipt.dayClosing —
    // a closed row drops off that cashier's sales view and belongs to the admin.
    dayClosing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DayClosing",
      default: null,
    },
    status: { type: String, enum: ["pending", "completed", "cancelled"], default: "pending" },
    // "refund" rows carry a negative totalAmount and reverse an earlier pos row.
    source: { type: String, enum: ["sales", "pos", "refund"], default: "sales" },
  },

{ timestamps: true }
);

const Sale= mongoose.model("Sale", SaleSchema);

module.exports=Sale
