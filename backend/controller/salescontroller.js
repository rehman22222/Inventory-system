const Sale = require("../models/Salesmodel");
const ProductModel = require('../models/Productmodel');
const logActivity = require("../libs/logger");

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

const dayRange = (from, to) => {
  const startSource = from || to || new Date();
  const endSource = to || from || startSource;
  const start = new Date(
    typeof startSource === "string" ? `${startSource}T00:00:00.000` : startSource
  );
  const end = new Date(
    typeof endSource === "string" ? `${endSource}T23:59:59.999` : endSource
  );

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

module.exports.createSale = async (req, res) => {
  try {
    const { customerName, products, paymentMethod, paymentStatus, status } = req.body;

    if (!customerName || !products || !products.product || !products.quantity || !products.price || !paymentMethod) {
      return res.status(400).json({ success: false, message: "All fields are required." });
    }


    const totalAmount = products.quantity * products.price;

    const productRecord = await ProductModel.findById(products.product);
    if (!productRecord) return res.status(404).json({ message: "Product not found" });

    if (productRecord.quantity < products.quantity) {
        return res.status(400).json({ 
            message: "Insufficient product quantity",
            available: productRecord.quantity,
            requested: quantity
        });
    }

    productRecord.quantity -= products.quantity;
    await productRecord.save();


    const newSale = new Sale({
      customerName,
      products,
      totalAmount,
      paymentMethod,
      paymentStatus,
      status,
    });

    await newSale.save();

   
    
  
    

    res.status(201).json({ success: true, message: "Sale created successfully", sale: newSale });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error creating sale", error });
  }
};


module.exports.getAllSales = async (req, res) => {
  try {
    const sales = await Sale.find().populate("products.product").sort({ createdAt: -1 });

    res.status(200).json({ success: true, sales });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching sales", error });
  }
};


module.exports.getSaleById = async (req, res) => {
  try {
    const { saleId } = req.params;

    const sale = await Sale.findById(saleId).populate("products.product");

    if (!sale) {
      return res.status(404).json({ success: false, message: "Sale not found" });
    }

    res.status(200).json({ success: true, sale });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching sale", error });
  }
};

module.exports.updateSale = async (req, res) => {
  try {
    const { saleId } = req.params;
    const updatedData = req.body;

  

    if (
      !updatedData ||
      !updatedData.products ||
      !updatedData.products.product ||
      !updatedData.products.quantity ||
      !updatedData.products.price
    ) {
      return res.status(400).json({
        success: false,
        message: "Product, quantity, and price are required."
      });
    }


    const updatedTotalAmount = updatedData.products.quantity * updatedData.products.price;


    const sale = await Sale.findByIdAndUpdate(
      saleId,
      { ...updatedData, totalAmount: updatedTotalAmount },
      { new: true }
    );

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: "Sale not found."
      });
    }

    res.status(200).json({
      success: true,
      message: "Sale updated successfully",
      sale: sale
    });
  } catch (error) {
    console.error("Error updating sale:", error);
    res.status(500).json({
      success: false,
      message: "Error updating sale",
      error: error.message
    });
  }
}

module.exports.overrideSalesReportTotal = async (req, res) => {
  try {
    const { from, to, targetTotal } = req.body;
    const range = dayRange(from, to);
    const target = money(targetTotal);

    if (!range) {
      return res.status(400).json({ success: false, message: "Invalid date range" });
    }

    if (!Number.isFinite(Number(targetTotal)) || target < 0) {
      return res.status(400).json({
        success: false,
        message: "Target total must be a valid positive number",
      });
    }

    const sales = await Sale.find({
      createdAt: { $gte: range.start, $lte: range.end },
    }).sort({ createdAt: 1 });

    if (sales.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No sale records found for this date range",
      });
    }

    const adjustable = sales.filter(
      (sale) => sale.source !== "refund" && Number(sale.totalAmount || 0) > 0
    );
    const fixedTotal = money(
      sales
        .filter((sale) => !adjustable.some((item) => String(item._id) === String(sale._id)))
        .reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0)
    );
    const currentTotal = money(sales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0));
    const currentAdjustableTotal = money(
      adjustable.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0)
    );
    const desiredAdjustableTotal = money(target - fixedTotal);

    if (desiredAdjustableTotal < 0) {
      return res.status(400).json({
        success: false,
        message: `Target total cannot be lower than fixed refund/negative records (${fixedTotal})`,
      });
    }

    if (adjustable.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No positive sale rows are available to rewrite",
      });
    }

    if (currentAdjustableTotal <= 0) {
      return res.status(400).json({
        success: false,
        message: "Current sale total is zero, so it cannot be scaled",
      });
    }

    const factor = desiredAdjustableTotal / currentAdjustableTotal;
    let remaining = desiredAdjustableTotal;
    const changedSales = [];

    for (let index = 0; index < adjustable.length; index += 1) {
      const sale = adjustable[index];
      const previousTotalAmount = money(sale.totalAmount);
      const previousUnitPrice = money(sale.products?.price || 0);
      const isLast = index === adjustable.length - 1;
      const nextTotalAmount = isLast ? money(remaining) : money(previousTotalAmount * factor);
      const quantity = Number(sale.products?.quantity || 1) || 1;
      const nextUnitPrice = money(nextTotalAmount / quantity);

      remaining = money(remaining - nextTotalAmount);

      sale.totalAmount = nextTotalAmount;
      sale.products.price = nextUnitPrice;
      sale.discount = money(Number(sale.discount || 0) * factor);
      sale.tax = money(Number(sale.tax || 0) * factor);
      sale.reportOverride = {
        previousTotalAmount,
        previousUnitPrice,
        targetReportTotal: target,
        factor,
        changedBy: req.user?._id,
        changedByName: req.user?.name,
        changedAt: new Date(),
      };
      sale.markModified("products");
      await sale.save();

      changedSales.push({
        saleId: sale._id,
        previousTotalAmount,
        totalAmount: sale.totalAmount,
      });
    }

    await logActivity({
      action: "Override Sales Report Total",
      description: `Sales total changed from ${currentTotal} to ${target} for ${range.start.toISOString().slice(0, 10)} - ${range.end.toISOString().slice(0, 10)}.`,
      entity: "order",
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: "Sales records updated to match the requested report total",
      from: range.start,
      to: range.end,
      previousTotal: currentTotal,
      targetTotal: target,
      updatedTotal: money(
        fixedTotal + changedSales.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0)
      ),
      updatedCount: changedSales.length,
      fixedTotal,
      changedSales,
    });
  } catch (error) {
    console.error("Error overriding sales report total:", error);
    return res.status(500).json({
      success: false,
      message: "Error overriding sales report total",
      error: error.message,
    });
  }
};


module.exports.SearchSales = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === "") {
     
      const allSales = await Sale.find().populate("products.product");
      return res.status(200).json({ success: true, sales: allSales });
    }

    const searchdata = await Sale.find({
      $or: [
        { customerName: { $regex: query, $options: "i" } },
        { paymentMethod: { $regex: query, $options: "i" } }
      ]
    }).populate("products.product"); 

    res.status(200).json({ sales: searchdata });

  } catch (error) {
    res.status(500).json({ success: false, message: "Error in searching sales", error: error.message });
  }
};
