const Sale = require("../models/Salesmodel");
const Receipt = require("../models/Receiptmodel");
const ProductModel = require('../models/Productmodel');
const logActivity = require("../libs/logger");
const { dealProductsByReceipt, saleLineHasDeal } = require("../libs/dealLineCoverage");
const { salesFilter } = require("../libs/salesFilters");
const Store = require("../models/Storemodel");
const { withPayments } = require("../libs/salePayments");

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

// Who reviews the shop's sales, as opposed to their own shift's.
//
// A manager supervises the floor — staff hand their day over to them, and the
// day-closing chain has always said so. Leaving them with only the sales they
// personally rang meant the Sales page read "No sales found" on a trading day,
// which looks like a broken screen rather than a permission.
//
// Staff still see their own, until they hand them over at day closing; that is
// the same rule the POS sale history uses.
const seesAllSales = (user) =>
  user?.role === "admin" || user?.role === "superadmin" || user?.role === "manager";

/* Which of these sales had an offer on them.
 *
 * A deal is recorded on the RECEIPT, not on the sale row — one receipt can be
 * several sale lines, and the offer belongs to the basket. So the sales list
 * cannot tell a deal from an ordinary discount on its own, and without this a
 * hand-typed markdown and a "3 for 18" would be coloured the same.
 *
 * One query however long the ledger is: it asks only for receipts that
 * actually carried an offer, and only for their number.
 */
const dealCoverage = async () => {
  const receipts = await Receipt.find({ dealDiscount: { $gt: 0 } })
    .select("receiptNo deals")
    .lean();
  return dealProductsByReceipt(receipts);
};

/* The sale, told what kind of sale it is.
 *
 * `hadDeal` is derived, never stored — the receipt remains the one record of
 * what was given, and this is only the list saying so. */
const withKind = (sales, deals) =>
  sales.map((sale) => ({
    ...sale,
    hadDeal: saleLineHasDeal(sale, deals),
  }));

const salesScope = (user) =>
  seesAllSales(user) ? {} : { cashier: user?._id, dayClosing: null };

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
      // Stamp who rang it, so the seller can still find it on their own sales
      // view once per-cashier scoping applies.
      cashier: req.user?._id,
      cashierName: req.user?.name,
    });

    await newSale.save();

   
    
  
    

    res.status(201).json({ success: true, message: "Sale created successfully", sale: newSale });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error creating sale", error });
  }
};


module.exports.getAllSales = async (req, res) => {
  try {
    /* Oldest first, so the newest sale is the LAST row rather than the first.
     *
     * The shop reads this the way a till roll reads: the day's takings in the
     * order they were rung up. Newest-first also stood the numbering on its
     * head — row 1 was the most recent sale, not the first of the day.
     *
     * Three things were quietly disagreeing with that order and now agree
     * with it: the sales chart plots this array as it stands, so its time
     * axis ran backwards; the search below never sorted at all; and the store
     * appends a newly created sale to the END of the list, which was the
     * wrong end while this was descending.
     *
     * .lean(): read-only list — skip document hydration for speed.
     *
     * .select() and a narrowed populate, because this is a LIST. It used to
     * hand back every field of every sale with the whole product document
     * welded onto each one — description, images, cost history, the online
     * catalogue link — for a table that shows a name. On a shop with a few
     * years of takings that was 6 MB down the wire before the page drew
     * anything. The fields named here are the ones the sales page, its chart
     * and its edit form actually read; the product keeps its id, which the
     * edit form needs, and gains nothing else. */
    const sales = await Sale.find(salesScope(req.user))
      .select(
        "customerName receiptNo products totalAmount discount tax status " +
          "paymentMethod paymentStatus source dayClosing createdAt",
      )
      .populate("products.product", "name")
      .sort({ createdAt: 1 })
      .lean();

    res.status(200).json({ success: true, sales: withKind(await withPayments(sales), await dealCoverage()) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching sales", error });
  }
};


module.exports.getSaleById = async (req, res) => {
  try {
    const { saleId } = req.params;

    const sale = await Sale.findOne({
      _id: saleId,
      ...salesScope(req.user),
    }).populate("products.product");

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


/* The filtered sales history: what was sold (product / flavour, receipt or
 * customer), how it was paid (cash / card / …) and when.
 *
 *   GET /sales/searchdata?query=&payment=&from=&to=
 *
 * Every parameter is optional and they combine. The narrowing itself is
 * libs/salesFilters — the same one the sales reports use — so the list on the
 * screen and the report downloaded beside it always hold the same rows.
 *
 * A search never reaches past what this user may list: the caller's scope is
 * ANDed with the filter, never replaced by it. */
module.exports.SearchSales = async (req, res) => {
  try {
    const shop = await Store.findOne({ key: "shop" }).select("timezone").lean();
    const { filter } = await salesFilter(req.query, shop?.timezone || "Europe/Dublin");

    const sales = await Sale.find({ $and: [salesScope(req.user), filter] })
      .select(
        "customerName receiptNo products totalAmount discount tax status " +
          "paymentMethod paymentStatus source dayClosing createdAt",
      )
      .populate("products.product", "name")
      // The same order as the full list, or filtering would reshuffle the rows.
      .sort({ createdAt: 1 })
      .lean();

    res.status(200).json({ success: true, sales: withKind(await withPayments(sales), await dealCoverage()) });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error in searching sales", error: error.message });
  }
};
