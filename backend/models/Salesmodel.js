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
    paymentMethod: { type: String, enum: ["cash", "creditcard", "banktransfer", "easypaisa", "jazzcash", "split"], required: true },
    invoiceUrl: { type: String }, 
    status: { type: String, enum: ["pending", "completed", "cancelled"], default: "pending" },
    // "refund" rows carry a negative totalAmount and reverse an earlier pos row.
    source: { type: String, enum: ["sales", "pos", "refund"], default: "sales" },
  },

{ timestamps: true }
);

const Sale= mongoose.model("Sale", SaleSchema);

module.exports=Sale
