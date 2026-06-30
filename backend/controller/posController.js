const Product = require("../models/Productmodel");
const Sale = require("../models/Salesmodel");
const StockTransaction = require("../models/StockTranscationmodel");
const Notification = require("../models/Notificationmodel");
const logActivity = require("../libs/logger");

const receiptNo = () => `POS-${Date.now().toString().slice(-8)}`;

module.exports.checkout = async (req, res) => {
  try {
    const {
      customerName = "Walk-in Customer",
      cashierName,
      items = [],
      paymentMethod,
      discount = 0,
      taxRate = 0,
      taxEnabled = false,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    if (!paymentMethod) {
      return res.status(400).json({ message: "Payment method is required" });
    }

    const receiptNumber = receiptNo();
    const cashierId = req.user?._id;
    const receiptItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.product);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const quantity = Number(item.quantity || 0);

      if (quantity <= 0) {
        return res.status(400).json({ message: `Invalid quantity for ${product.name}` });
      }

      if (Number(product.quantity) < quantity) {
        return res.status(400).json({
          message: `Only ${product.quantity} items available for ${product.name}`,
          product: product.name,
          available: product.quantity,
          requested: quantity,
        });
      }

      const price = Number(item.price || product.Price || 0);
      const lineTotal = price * quantity;
      subtotal += lineTotal;

      product.quantity = Number(product.quantity) - quantity;
      await product.save();

      await StockTransaction.create({
        product: product._id,
        type: "Stock-out",
        quantity,
        supplier: product.supplier,
        reference: receiptNumber,
      });

      if (product.quantity <= 10) {
        await Notification.create({
          name: "Low stock alert",
          type: `${product.name} has ${product.quantity} units remaining after POS sale ${receiptNumber}.`,
        });
      }

      await Sale.create({
        customerName,
        receiptNo: receiptNumber,
        cashier: cashierId,
        cashierName: cashierName || req.user?.name,
        products: {
          product: product._id,
          quantity,
          price,
        },
        totalAmount: lineTotal,
        discount: 0,
        tax: 0,
        paymentMethod,
        paymentStatus: "paid",
        status: "completed",
        source: "pos",
      });

      receiptItems.push({
        product: product._id,
        name: product.name,
        quantity,
        price,
        lineTotal,
      });
    }

    const safeDiscount = Math.min(Number(discount || 0), subtotal);
    const taxableAmount = Math.max(subtotal - safeDiscount, 0);
    const tax = taxEnabled ? taxableAmount * Number(taxRate || 0) : 0;
    const total = taxableAmount + tax;

    await logActivity({
      action: "POS Checkout",
      description: `Receipt ${receiptNumber} completed for ${customerName}.`,
      entity: "order",
      userId: cashierId,
      ipAddress: req.ip,
    });

    return res.status(201).json({
      success: true,
      message: "POS checkout completed",
      receipt: {
        receiptNo: receiptNumber,
        customerName,
        cashierName: cashierName || req.user?.name || "Cashier",
        paymentMethod,
        items: receiptItems,
        subtotal,
        discount: safeDiscount,
        tax,
        total,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: "POS checkout failed", error: error.message });
  }
};
