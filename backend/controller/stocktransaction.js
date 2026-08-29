const mongoose = require('mongoose');
const StockTransaction = require('../models/StockTranscationmodel');
const Product = require('../models/Productmodel');
const { runInTransaction } = require('../libs/txn');
const logActivity = require('../libs/logger');
const { emitStockChanged } = require('../libs/stockEvents');


// Record a stock movement AND move the stock.
//
// This wrote the ledger row and stopped there, so a delivery booked in here
// left the shelf count exactly where it was: the history said forty arrived and
// the catalogue still said none. Every other path in the system — a sale, a
// refund, a POS quick-add — moves the count and writes the row together,
// because a movement that only exists on paper is worse than one nobody
// recorded. Somebody trusts the number.
module.exports.createStockTransaction = async (req, res) => {
  try {
    const { product, type, quantity, supplier } = req.body;

    if (!product || !type || !quantity) {
      return res.status(400).json({ success: false, message: "Product, type, and quantity are required." });
    }

    if (!mongoose.isValidObjectId(product)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }

    const units = Math.floor(Number(quantity));
    if (!Number.isFinite(units) || units <= 0) {
      return res.status(400).json({ success: false, message: "Quantity must be a whole number above zero" });
    }

    if (type !== "Stock-in" && type !== "Stock-out") {
      return res.status(400).json({ success: false, message: `Unknown movement type: ${type}` });
    }

    const change = type === "Stock-in" ? units : -units;

    const result = await runInTransaction(async (session) => {
      const opts = session ? { session } : {};

      // Guarded, like the till's decrement: the filter re-checks the count at
      // write time, so booking stock out cannot take it below zero however many
      // people are doing it at once. A shop cannot ship what it does not have,
      // and a negative shelf count is a number nobody can act on.
      const filter = { _id: product };
      if (change < 0) filter.quantity = { $gte: units };

      const updated = await Product.findOneAndUpdate(
        filter,
        { $inc: { quantity: change } },
        { new: true, ...opts },
      ).select("name quantity supplier lowStockThreshold");

      if (!updated) {
        const exists = await Product.findById(product).select("name quantity").lean();
        throw Object.assign(
          new Error(
            exists
              ? `Only ${exists.quantity} of ${exists.name} in stock — cannot take out ${units}`
              : "Product not found",
          ),
          { statusCode: exists ? 400 : 404 },
        );
      }

      const [created] = await StockTransaction.create(
        [{ product, type, quantity: units, supplier: supplier || undefined }],
        opts,
      );

      return { created, updated };
    });

    // Every till showing this product patches its number rather than refetching
    // the catalogue.
    emitStockChanged(
      req,
      [{ product: result.updated._id, quantity: result.updated.quantity }],
      `Stock ${type}`,
    );

    // Stock moved by hand is the one movement with no sale or delivery behind
    // it to explain it, so the log carries who and how many.
    void logActivity({
      action: type === "Stock-in" ? "Stock In" : "Stock Out",
      description: `${type === "Stock-in" ? "Added" : "Removed"} ${units} x ${result.updated.name}. Now ${result.updated.quantity} in stock.`,
      entity: "product",
      entityId: result.updated._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    res.status(201).json({
      message: "Stock transaction created successfully",
      transaction: result.created,
      // So the page can show the new figure instead of the one it loaded with.
      product: { _id: result.updated._id, name: result.updated.name, quantity: result.updated.quantity },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: status === 500 ? "Error creating stock transaction" : error.message,
    });
  }
};


module.exports.getAllStockTransactions = async (req, res) => {
  try {
    const transactions = await StockTransaction.find()
    .sort({ transactionDate: -1 });

    res.status(200).json({message: "Stock transaction created successfully",transactions});
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching stock transactions", error });
  }
};


module.exports.getStockTransactionsByProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    // The field is `supplier`; populating "Supplier" threw a StrictPopulateError
    // on every call, so this route answered 500 whatever you asked it for.
    const transactions = await StockTransaction.find({ product: productId }).populate('supplier').sort({ transactionDate: -1 });

    if (!transactions || transactions.length === 0) {
      return res.status(404).json({ success: false, message: "No transactions found for this product." });
    }

    res.status(200).json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching transactions by product", error });
  }
};


module.exports.getStockTransactionsBySupplier = async (req, res) => {
  try {
    const { supplierId } = req.params;

    const transactions = await StockTransaction.find({ supplier: supplierId }).populate('product').sort({ transactionDate: -1 });

    if (!transactions || transactions.length === 0) {
      return res.status(404).json({ success: false, message: "No transactions found for this supplier." });
    }

    res.status(200).json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching transactions by supplier", error });
  }
};


module.exports.searchStocks = async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ message: "Query parameter is required" });
    }

    const stocks = await StockTransaction.find({})
      .populate('product') 
      .then((transactions) => {
        return transactions.filter((transaction) => 
          transaction.type.toLowerCase().includes(query.toLowerCase()) ||
          (transaction.product && transaction.product.name.toLowerCase().includes(query.toLowerCase()))
        );
      });

    res.json(stocks);
  } catch (error) {
    res.status(500).json({ message: "Error finding product", error: error.message });
  }
};