const Sale = require("../models/Salesmodel");
const Receipt = require("../models/Receiptmodel");
const ProductModel = require('../models/Productmodel');
const logActivity = require("../libs/logger");

// Characters that mean something to a regex, escaped before a typed search
// becomes one.
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

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
const receiptNosWithDeals = async () => {
  const receipts = await Receipt.find({ dealDiscount: { $gt: 0 } })
    .select("receiptNo")
    .lean();
  return new Set(receipts.map((receipt) => String(receipt.receiptNo || "")).filter(Boolean));
};

/* The sale, told what kind of sale it is.
 *
 * `hadDeal` is derived, never stored — the receipt remains the one record of
 * what was given, and this is only the list saying so. */
const withKind = (sales, dealReceipts) =>
  sales.map((sale) => ({
    ...sale,
    hadDeal: dealReceipts.has(String(sale.receiptNo || "")),
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

    res.status(200).json({ success: true, sales: withKind(sales, await receiptNosWithDeals()) });
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


module.exports.SearchSales = async (req, res) => {
  try {
    const { query } = req.query;
    // A search must never reach past what this user is allowed to list.
    const scope = salesScope(req.user);

    if (!query || query.trim() === "") {

      // The same order as the list this filters, or clearing the box would
      // reshuffle the rows under the cashier's hand.
      const allSales = await Sale.find(scope)
        .populate("products.product")
        .sort({ createdAt: 1 });
      return res.status(200).json({
        success: true,
        sales: withKind(allSales, await receiptNosWithDeals()),
      });
    }

    /* The box says "Enter your product", so it had better find one.

     * It searched customerName and paymentMethod only, which at a till are
     * nearly always "Walk-In" and "cash" — so the one thing anybody actually
     * types, a product name, matched nothing and the page went blank. That
     * reads as a broken search rather than as no results.
     *
     * A product name cannot be reached with a regex from here: products.product
     * is a reference and the name lives on the Product, so the products are
     * looked up first and the sales matched on their ids.
     *
     * Receipt numbers are in too. They are how a sale is referred to out loud —
     * on the customer's slip, in the day's takings, and by the archive screen,
     * which asks for a range "from this sale to that sale".
     *
     * The text is escaped before it becomes a regex. Somebody searching for a
     * product with a bracket in its name should get that product, not a cast
     * error, and a regex built from typing is a regex somebody else controls. */
    const escaped = query.trim().replace(REGEX_SPECIALS, "\\$&");
    const like = { $regex: escaped, $options: "i" };

    const named = await ProductModel.find({ name: like }).select("_id").lean();

    const searchdata = await Sale.find({
      ...scope,
      $or: [
        { customerName: like },
        { paymentMethod: like },
        { receiptNo: like },
        ...(named.length
          ? [{ "products.product": { $in: named.map((row) => row._id) } }]
          : []),
      ],
    })
      .populate("products.product")
      .sort({ createdAt: 1 });

    res.status(200).json({ sales: withKind(searchdata, await receiptNosWithDeals()) });

  } catch (error) {
    res.status(500).json({ success: false, message: "Error in searching sales", error: error.message });
  }
};
