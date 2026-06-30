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
    paymentStatus: { type: String, enum: ["pending", "paid"], default: "pending" },
    paymentMethod: { type: String, enum: ["cash", "creditcard", "banktransfer", "easypaisa", "jazzcash"], required: true },
    invoiceUrl: { type: String }, 
    status: { type: String, enum: ["pending", "completed", "cancelled"], default: "pending" },
    source: { type: String, enum: ["sales", "pos"], default: "sales" },
  },

{ timestamps: true }
);

const Sale= mongoose.model("Sale", SaleSchema);

module.exports=Sale
