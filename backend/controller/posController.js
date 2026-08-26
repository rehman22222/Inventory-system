const mongoose = require("mongoose");
const Product = require("../models/Productmodel");
const Sale = require("../models/Salesmodel");
const StockTransaction = require("../models/StockTranscationmodel");
const Notification = require("../models/Notificationmodel");
const Receipt = require("../models/Receiptmodel");
const Voucher = require("../models/Vouchermodel");
const HeldSale = require("../models/HeldSalemodel");
const Deal = require("../models/Dealmodel");
const DayClosing = require("../models/DayClosingmodel");
const Store = require("../models/Storemodel");
const { nextSequence } = require("../models/Countermodel");
const { runInTransaction } = require("../libs/txn");
const { applicableDeals } = require("../libs/deals");
const { startOfDay, endOfDay } = require("../libs/time");
const { raiseReorderForProduct } = require("./reorderController");
const logActivity = require("../libs/logger");
const { emitStockChanged } = require('../libs/stockEvents');

const DEFAULT_LOW_STOCK = 10;

// What the shop takes. Kept in step with the Receipt/Sale schema enums — a till
// running an old page after a deploy must get a clear 400, not a schema 500.
const PAYMENT_METHODS = ["cash", "creditcard", "wallet"];

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

// The owner side sees every cashier's takings. A cashier (manager/staff) only
// ever sees their own, and only until they close their day.
const seesAllSales = (user) => user?.role === "admin" || user?.role === "superadmin";

// Anyone who is allowed to refund must be able to pull up a receipt by its
// printed number, including one a colleague rang. Staff get their own only.
const canLookupAnyReceipt = (user) =>
  seesAllSales(user) || user?.role === "manager";

// What a cashier is allowed to see in their own history: their receipts that
// have not yet been handed over at day closing.
const ownOpenScope = (user) => ({ cashier: user._id, dayClosing: null });

// Who sees whose day-closing batches, up the chain:
//   staff closing   → manager + admin + superadmin
//   manager closing → admin + superadmin
// So a manager's tab is only for staff handovers. Once the manager closes their
// own day, that batch moves up to admin/superadmin and disappears from the
// manager view. Owner side sees everything. Uses cashierRole, which is
// snapshotted on every DayClosing.
const closingScope = (user) => {
  if (seesAllSales(user)) return {};
  if (user?.role === "manager") {
    return { cashierRole: "staff" };
  }
  return { cashier: user?._id };
};

// Does one already-loaded closing fall within a viewer's scope? (Same rule as
// closingScope, checked in memory so getDayClosing needs no second query.)
const canSeeClosing = (user, closing) => {
  if (seesAllSales(user)) return true;
  const isOwn = String(closing.cashier) === String(user?._id);
  if (user?.role === "manager") return closing.cashierRole === "staff";
  return isOwn;
};

const opts = (session) => (session ? { session } : {});

const receiptNumber = async (session) => {
  const seq = await nextSequence("receipt", session);
  return `POS-${String(seq).padStart(6, "0")}`;
};

// Best-effort side effects. A failure here must never fail a completed sale.
const raiseLowStockAlerts = async (products, reference) => {
  try {
    const low = products.filter(
      (product) => product.quantity <= (product.lowStockThreshold ?? DEFAULT_LOW_STOCK),
    );
    await Promise.all(
      low.map((product) =>
        Notification.create({
          name: "Low stock alert",
          type: `${product.name} has ${product.quantity} units remaining after ${reference}.`,
        }),
      ),
    );
    // In addition to the in-app alert, raise a reorder for each low item and
    // email the shop to approve it. Also best-effort — a mail hiccup must never
    // fail the sale.
    await Promise.all(low.map((product) => raiseReorderForProduct(product._id)));
  } catch (error) {
    console.error("Low stock notification failed:", error.message);
  }
};

module.exports.checkout = async (req, res) => {
  try {
    const {
      customerName = "Walk-in Customer",
      items = [],
      paymentMethod,
      payments,
      discount = 0,
      discountType = "amount",
      taxRate = 0,
      taxEnabled = false,
      voucherCode,
      amountTendered,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // A sale is settled either with one method, or with a list of tenders
    // (€30 cash + €20 card). Normalise both shapes into `tenders`.
    const tenders =
      Array.isArray(payments) && payments.length > 0
        ? payments
            .map((entry) => ({
              method: entry.method,
              amount: money(entry.amount),
            }))
            .filter((entry) => entry.amount > 0)
        : [];

    if (tenders.length === 0 && !paymentMethod) {
      return res.status(400).json({ message: "Payment method is required" });
    }

    if (tenders.some((entry) => !entry.method)) {
      return res.status(400).json({ message: "Every payment needs a method" });
    }

    const unsupported = tenders.find(
      (entry) => !PAYMENT_METHODS.includes(entry.method),
    );

    if (unsupported) {
      return res.status(400).json({
        message: `This till does not take ${unsupported.method} — refresh the page and try again`,
      });
    }

    if (tenders.length === 0 && !PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({
        message: `This till does not take ${paymentMethod} — refresh the page and try again`,
      });
    }

    // --- Pass 1: validate everything before mutating anything. A bad item at
    // position 3 must not leave items 1 and 2 already sold.
    const lines = [];

    // One round trip for the whole basket instead of a findById per line. A
    // 20-item cart used to mean 20 sequential queries before the sale even
    // started, which is felt as lag at the till. The checks below still run in
    // basket order, so the error a cashier sees for a bad cart is unchanged.
    const basketIds = items
      .map((item) => item.product)
      .filter((id) => mongoose.isValidObjectId(id));

    // The basket, the voucher and the active deals are three independent reads
    // that used to run one after another. On a remote cluster each is its own
    // ~100ms round trip, and the cashier waited through all three before the
    // sale even started. Fetching them together costs one round trip instead of
    // three. Nothing about the answers changes — the same queries, against the
    // same data — and every check below still runs in the same order, so a bad
    // cart still fails on exactly the message it failed on before.
    const [foundProducts, prefetchedVoucher, activeDeals] = await Promise.all([
      Product.find({ _id: { $in: basketIds } }),
      voucherCode
        ? Voucher.findOne({ code: String(voucherCode).trim().toUpperCase() })
        : null,
      Deal.find({ active: true }).lean(),
    ]);

    const productsById = new Map(
      foundProducts.map((product) => [String(product._id), product]),
    );

    for (const item of items) {
      // A malformed id would otherwise throw a CastError and surface as an
      // opaque 500.
      if (!mongoose.isValidObjectId(item.product)) {
        return res
          .status(400)
          .json({ message: `Invalid product id: ${item.product}` });
      }

      const product = productsById.get(String(item.product));

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      const quantity = Number(item.quantity || 0);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res
          .status(400)
          .json({ message: `Invalid quantity for ${product.name}` });
      }

      if (Number(product.quantity) < quantity) {
        return res.status(400).json({
          message: `Only ${product.quantity} items available for ${product.name}`,
          product: product.name,
          available: product.quantity,
          requested: quantity,
        });
      }

      // Price always comes from the database, never from the request body.
      const price = money(product.Price);

      lines.push({
        product,
        quantity,
        price,
        lineTotal: money(price * quantity),
      });
    }

    const subtotal = money(
      lines.reduce((sum, line) => sum + line.lineTotal, 0),
    );

    // --- Voucher
    let voucher = null;
    let voucherDiscount = 0;

    if (voucherCode) {
      voucher = prefetchedVoucher;

      if (!voucher) {
        return res.status(400).json({ message: "Voucher not found" });
      }

      const reason = voucher.rejectionReason(subtotal);
      if (reason) {
        return res.status(400).json({ message: reason });
      }

      voucherDiscount = money(voucher.computeDiscount(subtotal));
    }

    // --- Manual discount, applied after the voucher on the remaining balance.
    const afterVoucher = Math.max(subtotal - voucherDiscount, 0);
    const rawManual =
      discountType === "percent"
        ? (afterVoucher * Number(discount || 0)) / 100
        : Number(discount || 0);
    const manualDiscount = money(
      Math.max(0, Math.min(rawManual, afterVoucher)),
    );

    // --- Deals: automatic bundle discounts. Computed server-side from the
    // active deals (never trusted from the client) and applied against whatever
    // balance is left, so voucher/manual math stays exactly as before.
    // Quantity and price both matter: a percentage deal is a percentage of its
    // own products' value.
    const cartMap = new Map();
    for (const line of lines) {
      const key = String(line.product._id);
      const seen = cartMap.get(key);
      cartMap.set(key, {
        quantity: (seen?.quantity || 0) + line.quantity,
        price: line.price,
      });
    }

    const dealResult = applicableDeals(cartMap, activeDeals);

    const dealRoom = Math.max(subtotal - voucherDiscount - manualDiscount, 0);
    const dealDiscount = money(Math.min(dealResult.total, dealRoom));

    const totalDiscount = money(voucherDiscount + manualDiscount + dealDiscount);
    const taxable = Math.max(subtotal - totalDiscount, 0);
    const tax = money(taxEnabled ? taxable * Number(taxRate || 0) : 0);
    const total = money(taxable + tax);

    // The customer must actually have covered the bill. Overpaying is fine —
    // that is change.
    const paid =
      tenders.length > 0
        ? money(tenders.reduce((sum, e) => sum + e.amount, 0))
        : null;

    if (paid !== null && paid + 0.001 < total) {
      return res.status(400).json({
        message: `Short by ${money(total - paid)} — take the rest before closing the sale`,
        total,
        paid,
        remaining: money(total - paid),
      });
    }

    const settledWith =
      tenders.length === 0
        ? paymentMethod
        : tenders.length === 1
          ? tenders[0].method
          : "split";

    const cashierId = req.user?._id;
    const cashierName = req.user?.name || "Cashier";

    const receipt = await runInTransaction(async (session) => {
      const receiptNo = await receiptNumber(session);

      const saleIds = [];

      // On a MongoDB without transactions there is nothing to roll back for us,
      // so record what we touched and undo it by hand if the sale fails
      // half-way. Without this the fallback path reintroduces the partial-sale
      // bug the transaction exists to prevent.
      const undo = { stock: [], sales: [], stockTx: [], voucherId: null };

      const compensate = async () => {
        if (session) return;

        try {
          await Promise.all(
            [
              ...undo.stock.map((entry) =>
                Product.updateOne(
                  { _id: entry.product },
                  { $inc: { quantity: entry.quantity } },
                ),
              ),
              undo.sales.length
                ? Sale.deleteMany({ _id: { $in: undo.sales } })
                : null,
              undo.stockTx.length
                ? StockTransaction.deleteMany({ _id: { $in: undo.stockTx } })
                : null,
              undo.voucherId
                ? Voucher.updateOne(
                    { _id: undo.voucherId },
                    { $inc: { usedCount: -1 }, $set: { status: "active" } },
                  )
                : null,
            ].filter(Boolean),
          );
        } catch (error) {
          console.error("Checkout compensation failed:", error.message);
        }
      };

      try {
        // Every line used to cost three sequential round trips — decrement,
        // movement row, sale row. On a remote cluster that is ~100ms each, so a
        // five-item basket spent well over a second waiting on the network with
        // the cashier watching. The work is identical; only the shape changed.
        const decrement = async (line) => {
          // Guarded decrement: the filter re-checks stock at write time, so two
          // tills selling the last unit can't both succeed.
          const updated = await Product.findOneAndUpdate(
            { _id: line.product._id, quantity: { $gte: line.quantity } },
            { $inc: { quantity: -line.quantity } },
            { new: true, ...opts(session) },
          );

          if (!updated) {
            throw Object.assign(
              new Error(
                `Stock changed for ${line.product.name} — please rescan the item`,
              ),
              { statusCode: 409 },
            );
          }

          undo.stock.push({ product: updated._id, quantity: line.quantity });
          line.product = updated;
        };

        // Distinct products can be decremented together — each carries its own
        // stock guard, so they cannot interfere. The same product appearing on
        // two lines is the one case that must stay in order: run in parallel and
        // both guards would read the pre-sale figure and both would pass.
        const distinct =
          new Set(lines.map((line) => String(line.product._id))).size === lines.length;

        if (distinct) {
          // allSettled, not all: a rejection must not leave siblings in flight
          // while compensation is already unwinding what they wrote.
          const results = await Promise.allSettled(lines.map(decrement));
          const failed = results.find((result) => result.status === "rejected");
          if (failed) throw failed.reason;
        } else {
          for (const line of lines) await decrement(line);
        }

        const createdTx = await StockTransaction.insertMany(
          lines.map((line) => ({
            product: line.product._id,
            type: "Stock-out",
            quantity: line.quantity,
            supplier: line.product.supplier,
            reference: receiptNo,
          })),
          opts(session),
        );
        undo.stockTx.push(...createdTx.map((doc) => doc._id));

        const createdSales = await Sale.insertMany(
          lines.map((line) => {
            // Spread discount and tax across the lines in proportion to their
            // value so that the Sale rows sum back to the receipt total.
            const share = subtotal > 0 ? line.lineTotal / subtotal : 0;
            const lineDiscount = money(totalDiscount * share);
            const lineTax = money(tax * share);

            return {
              customerName,
              receiptNo,
              cashier: cashierId,
              cashierName,
              products: {
                product: line.product._id,
                quantity: line.quantity,
                price: line.price,
              },
              totalAmount: money(line.lineTotal - lineDiscount + lineTax),
              discount: lineDiscount,
              tax: lineTax,
              paymentMethod: settledWith,
              paymentStatus: "paid",
              status: "completed",
              source: "pos",
            };
          }),
          opts(session),
        );

        saleIds.push(...createdSales.map((doc) => doc._id));
        undo.sales.push(...createdSales.map((doc) => doc._id));

        if (voucher) {
          // Redeem atomically: the filter re-checks the usage limit at write time,
          // so two tills racing on a single-use code can't both spend it. Saving a
          // doc that was loaded before the transaction would let both win.
          const redeemed = await Voucher.findOneAndUpdate(
            {
              _id: voucher._id,
              status: "active",
              $expr: { $lt: ["$usedCount", "$usageLimit"] },
            },
            {
              $inc: { usedCount: 1 },
              $set: { redeemedAt: new Date(), redeemedOn: receiptNo },
            },
            { new: true, ...opts(session) },
          );

          if (!redeemed) {
            throw Object.assign(
              new Error("This voucher has already been used"),
              {
                statusCode: 400,
              },
            );
          }

          undo.voucherId = redeemed._id;

          if (redeemed.usedCount >= redeemed.usageLimit) {
            await Voucher.updateOne(
              { _id: redeemed._id },
              { $set: { status: "used" } },
              opts(session),
            );
          }
        }

        const tendered =
          paid !== null
            ? paid
            : amountTendered === undefined
              ? undefined
              : money(amountTendered);

        const [created] = await Receipt.create(
          [
            {
              receiptNo,
              cashier: cashierId,
              cashierName,
              customerName,
              items: lines.map((line) => ({
                product: line.product._id,
                name: line.product.name,
                barcode: line.product.barcode,
                quantity: line.quantity,
                price: line.price,
                lineTotal: line.lineTotal,
              })),
              subtotal,
              discount: totalDiscount,
              discountType,
              dealDiscount,
              deals: dealResult.applied.map((entry) => ({
                dealId: entry.dealId,
                name: entry.name,
                sets: entry.sets,
                amount: entry.amount,
              })),
              voucher: voucher
                ? {
                    code: voucher.code,
                    voucherId: voucher._id,
                    amount: voucherDiscount,
                  }
                : undefined,
              taxEnabled,
              taxRate: Number(taxRate || 0),
              tax,
              total,
              payments: tenders,
              paymentMethod: settledWith,
              amountTendered: tendered,
              changeDue:
                tendered === undefined
                  ? undefined
                  : money(Math.max(0, tendered - total)),
              status: "completed",
              saleIds,
            },
          ],
          opts(session),
        );

        return created;
      } catch (error) {
        await compensate();
        throw error;
      }
    });

    // The lines carry the post-decrement documents, so the new quantities are
    // already in hand — every other screen can move without asking again.
    emitStockChanged(
      req,
      lines.map((line) => ({
        product: line.product?._id,
        quantity: line.product?.quantity,
      })),
      `POS sale ${receipt.receiptNo}`,
    );

    // The sale is committed; these are bookkeeping. Awaiting them held the
    // receipt back by two more round trips while a customer stood at the
    // counter, and neither can undo a sale that already happened. Failures are
    // logged rather than thrown — a notification that did not send must never
    // look like a sale that did not complete.
    raiseLowStockAlerts(
      lines.map((line) => line.product),
      `POS sale ${receipt.receiptNo}`,
    ).catch((error) => console.error("Low-stock alert failed:", error.message));

    logActivity({
      action: "POS Checkout",
      description: `Receipt ${receipt.receiptNo} completed for ${customerName}.`,
      entity: "order",
      entityId: receipt._id,
      userId: cashierId,
      ipAddress: req.ip,
    }).catch((error) => console.error("Activity log failed:", error.message));

    return res.status(201).json({
      success: true,
      message: "POS checkout completed",
      receipt: {
        receiptNo: receipt.receiptNo,
        customerName: receipt.customerName,
        cashierName: receipt.cashierName,
        paymentMethod: receipt.paymentMethod,
        payments: receipt.payments,
        items: receipt.items,
        subtotal: receipt.subtotal,
        discount: receipt.discount,
        dealDiscount: receipt.dealDiscount,
        deals: receipt.deals,
        voucher: receipt.voucher,
        taxRate: receipt.taxRate,
        tax: receipt.tax,
        total: receipt.total,
        amountTendered: receipt.amountTendered,
        changeDue: receipt.changeDue,
        createdAt: receipt.createdAt,
      },
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res
      .status(status)
      .json({
        message: status === 500 ? "POS checkout failed" : error.message,
        error: error.message,
      });
  }
};

// How much of each line has already gone back over the counter.
const refundedSoFar = (receipt) => {
  const map = new Map();

  receipt.refunds.forEach((refund) => {
    refund.items.forEach((item) => {
      const key = String(item.product);
      map.set(key, (map.get(key) || 0) + Number(item.quantity || 0));
    });
  });

  return map;
};

// Work out which lines to send back, from a receipt read *inside* the session.
const planRefund = (receipt, requested) => {
  const already = refundedSoFar(receipt);

  // An empty item list means "refund everything still outstanding".
  const lines = [];

  for (const item of receipt.items) {
    const key = String(item.product);
    const outstanding = item.quantity - (already.get(key) || 0);

    let quantity;
    if (requested.length === 0) {
      quantity = outstanding;
    } else {
      const match = requested.find((entry) => String(entry.product) === key);
      quantity = match ? Number(match.quantity || 0) : 0;
    }

    if (quantity <= 0) continue;

    if (quantity > outstanding) {
      throw Object.assign(
        new Error(
          `Cannot refund ${quantity} x ${item.name} — only ${outstanding} left on this receipt`,
        ),
        { statusCode: 400 },
      );
    }

    lines.push({
      product: item.product,
      name: item.name,
      quantity,
      price: item.price,
      // Refund at the price actually paid, i.e. net of the share of the
      // discount and tax that this line carried.
      lineTotal: money(
        (receipt.total / (receipt.subtotal || 1)) *
          money(item.price * quantity),
      ),
    });
  }

  if (lines.length === 0) {
    throw Object.assign(new Error("Nothing left to refund on this receipt"), {
      statusCode: 400,
    });
  }

  return lines;
};

const performRefund = async ({
  receiptNo,
  requested,
  reason,
  user,
  ip,
  isVoid,
}) => {
  const reference = `RFD-${receiptNo}`;

  const result = await runInTransaction(async (session) => {
    // Re-read the receipt inside the session. Planning off a document fetched
    // earlier would double-refund on a transaction retry, and would let two
    // concurrent refunds both believe the same units are still outstanding.
    //
    // Matched on either reference: a sale rung up offline printed its OFF- ref,
    // and that is what the customer hands back over the counter.
    const query = Receipt.findOne({
      $or: [{ receiptNo }, { "offline.ref": receiptNo }],
    });
    const receipt = session ? await query.session(session) : await query;

    if (!receipt) {
      throw Object.assign(new Error("Receipt not found"), { statusCode: 404 });
    }

    if (receipt.status === "voided" || receipt.status === "refunded") {
      throw Object.assign(
        new Error(`This receipt is already ${receipt.status}`),
        {
          statusCode: 400,
        },
      );
    }

    const lines = planRefund(receipt, requested);
    const amount = money(lines.reduce((sum, line) => sum + line.lineTotal, 0));

    for (const line of lines) {
      await Product.findByIdAndUpdate(
        line.product,
        { $inc: { quantity: line.quantity } },
        opts(session),
      );

      await StockTransaction.create(
        [
          {
            product: line.product,
            type: "Stock-in",
            quantity: line.quantity,
            reference,
          },
        ],
        opts(session),
      );

      // A negative Sale row tagged source:"refund", so reports can net it out
      // (and reverse its cost) rather than treating it as another sale.
      await Sale.create(
        [
          {
            customerName: receipt.customerName,
            receiptNo: reference,
            cashier: user._id,
            cashierName: user.name,
            products: {
              product: line.product,
              quantity: line.quantity,
              price: line.price,
            },
            totalAmount: -line.lineTotal,
            paymentMethod: receipt.paymentMethod,
            paymentStatus: "paid",
            status: "cancelled",
            source: "refund",
          },
        ],
        opts(session),
      );
    }

    receipt.refunds.push({
      at: new Date(),
      by: user._id,
      byName: user.name,
      reason: reason || (isVoid ? "void" : "refund"),
      amount,
      items: lines,
    });

    // Fully refunded once every line has nothing outstanding.
    const after = refundedSoFar(receipt);
    const fully = receipt.items.every(
      (item) => (after.get(String(item.product)) || 0) >= item.quantity,
    );

    receipt.status = isVoid
      ? "voided"
      : fully
        ? "refunded"
        : "partially-refunded";

    await receipt.save(opts(session));

    return { amount, lines, status: receipt.status, receiptId: receipt._id };
  });

  await logActivity({
    action: isVoid ? "POS Void" : "POS Refund",
    description: `${isVoid ? "Voided" : "Refunded"} ${result.amount} on receipt ${receiptNo}.`,
    entity: "order",
    entityId: result.receiptId,
    userId: user._id,
    ipAddress: ip,
  });

  return result;
};

module.exports.refund = async (req, res) => {
  try {
    const { receiptNo, items = [], reason } = req.body;

    if (!receiptNo) {
      return res.status(400).json({ message: "Receipt number is required" });
    }

    const bad = (Array.isArray(items) ? items : []).find(
      (item) => !mongoose.isValidObjectId(item.product),
    );

    if (bad) {
      return res
        .status(400)
        .json({ message: `Invalid product id: ${bad.product}` });
    }

    const reference = String(receiptNo).trim().toUpperCase();

    const result = await performRefund({
      receiptNo: reference,
      requested: Array.isArray(items) ? items : [],
      reason,
      user: req.user,
      ip: req.ip,
      isVoid: false,
    });

    return res.status(200).json({
      success: true,
      message: `Refunded ${result.amount}`,
      receiptNo: reference,
      status: result.status,
      amount: result.amount,
      items: result.lines,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res
      .status(status)
      .json({ message: status === 500 ? "Refund failed" : error.message });
  }
};

module.exports.voidSale = async (req, res) => {
  try {
    const reference = String(req.params.receiptNo).trim().toUpperCase();

    const result = await performRefund({
      receiptNo: reference,
      requested: [],
      reason: req.body?.reason || "void",
      user: req.user,
      ip: req.ip,
      isVoid: true,
    });

    return res.status(200).json({
      success: true,
      message: `Receipt ${reference} voided`,
      amount: result.amount,
      status: result.status,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res
      .status(status)
      .json({ message: status === 500 ? "Void failed" : error.message });
  }
};

module.exports.getReceipts = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 25), 100);

    // A cashier's history is their own open takings only. Once they close the
    // day the batch belongs to the admin and drops off their list.
    const filter = seesAllSales(req.user) ? {} : ownOpenScope(req.user);

    // The owner side may narrow to one cashier.
    if (seesAllSales(req.user) && req.query.cashier) {
      if (!mongoose.isValidObjectId(req.query.cashier)) {
        return res.status(400).json({ message: "Invalid cashier id" });
      }
      filter.cashier = req.query.cashier;
    }

    const receipts = await Receipt.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.status(200).json({ receipts });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching receipts", error: error.message });
  }
};

// "Ghost mode": the owner's view over the whole shop — every sale, every
// cashier, every day, whether or not it has been handed over at day closing.
// Nothing here is scoped to the caller, which is exactly why it is superadmin
// only.
module.exports.getAllSales = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const page = Math.max(Number(req.query.page || 1), 1);
    const filter = {};

    if (req.query.cashier) {
      if (!mongoose.isValidObjectId(req.query.cashier)) {
        return res.status(400).json({ message: "Invalid cashier id" });
      }
      // Cast explicitly. find() would coerce the string for us, but $match in an
      // aggregate does not — leaving it a string made the totals silently come
      // back as zero while the rows themselves listed fine.
      filter.cashier = new mongoose.Types.ObjectId(req.query.cashier);
    }

    if (req.query.from || req.query.to) {
      // Day boundaries are the shop's local midnight, so ghost mode's totals line
      // up with the reports and never split a late-night sale into the wrong day.
      const shop = await Store.findOne({ key: "shop" }).select("timezone").lean();
      const tz = shop?.timezone || "UTC";
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = startOfDay(req.query.from, tz);
      if (req.query.to) filter.createdAt.$lte = endOfDay(req.query.to, tz);
    }

    if (req.query.status) filter.status = req.query.status;

    const [receipts, total, totals, byCashier] = await Promise.all([
      Receipt.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Receipt.countDocuments(filter),
      // Totals across the WHOLE filter, not just this page — a page total would
      // be meaningless to the owner.
      Receipt.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            net: { $sum: "$total" },
            gross: { $sum: "$subtotal" },
            discount: { $sum: "$discount" },
            tax: { $sum: "$tax" },
          },
        },
      ]),
      Receipt.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { cashier: "$cashier", name: "$cashierName" },
            net: { $sum: "$total" },
            count: { $sum: 1 },
          },
        },
        { $sort: { net: -1 } },
      ]),
    ]);

    const sum = totals[0] || { net: 0, gross: 0, discount: 0, tax: 0 };

    return res.status(200).json({
      receipts,
      page,
      pages: Math.max(Math.ceil(total / limit), 1),
      total,
      totals: {
        net: money(sum.net),
        gross: money(sum.gross),
        discount: money(sum.discount),
        tax: money(sum.tax),
      },
      byCashier: byCashier.map((entry) => ({
        cashier: entry._id.cashier,
        name: entry._id.name,
        net: money(entry.net),
        count: entry.count,
      })),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching sales", error: error.message });
  }
};

module.exports.getReceipt = async (req, res) => {
  try {
    const reference = String(req.params.receiptNo).trim().toUpperCase();

    // A sale rung up offline printed its own ref (OFF-…), not the sequential
    // number assigned later at sync — so a refund has to find it by either.
    const filter = {
      $or: [{ receiptNo: reference }, { "offline.ref": reference }],
    };

    // Staff can only pull up their own. Manager and above can look up any
    // receipt by its printed number — that is what a counter refund needs.
    if (!canLookupAnyReceipt(req.user)) {
      filter.cashier = req.user._id;
    }

    const receipt = await Receipt.findOne(filter);

    if (!receipt) {
      return res.status(404).json({ message: "Receipt not found" });
    }

    return res.status(200).json({ receipt });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching receipt", error: error.message });
  }
};

// --- Offline sync ----------------------------------------------------------

// Take one sale that was rung up while the till had no network.
//
// The rules here follow from one fact: the goods have already left the shop and
// the customer is holding a printed receipt. So this endpoint never rejects a
// sale for a reason that arose *after* it happened —
//   * the printed prices are honoured (the receipt is the contract),
//   * stock is allowed to go negative if another till sold the same units,
//   * and anything the server would have done differently is FLAGGED for the
//     admin instead of being silently rewritten.
//
// It is idempotent on `clientRef`: replaying the queue after a dropped
// connection must never charge a customer twice.
const syncOneSale = async (sale, user, ip) => {
  const clientRef = String(sale?.clientRef || "").trim();

  if (!clientRef) {
    return { ok: false, clientRef, message: "clientRef is required" };
  }

  // Already in? Then this is a retry — hand back what we stored the first time.
  const existing = await Receipt.findOne({ "offline.clientRef": clientRef });
  if (existing) {
    return {
      ok: true,
      duplicate: true,
      clientRef,
      receiptNo: existing.receiptNo,
      offlineRef: existing.offline?.ref,
    };
  }

  const items = Array.isArray(sale.items) ? sale.items : [];
  if (items.length === 0) {
    return { ok: false, clientRef, message: "The sale has no items" };
  }

  // Flags found before we touch anything. Anything discovered *during* the
  // write is collected per attempt (see below) — a transaction retry must not
  // stack the same flag up twice.
  const priceFlags = [];
  const lines = [];

  // Batched for the same reason as checkout — and it matters more here: a till
  // coming back online flushes its whole queue, so this ran once per item of
  // every queued sale.
  const syncIds = items
    .map((item) => item.product)
    .filter((id) => mongoose.isValidObjectId(id));

  const syncProducts = await Product.find({ _id: { $in: syncIds } });
  const syncProductsById = new Map(
    syncProducts.map((product) => [String(product._id), product]),
  );

  for (const item of items) {
    if (!mongoose.isValidObjectId(item.product)) {
      return { ok: false, clientRef, message: `Invalid product id: ${item.product}` };
    }

    const product = syncProductsById.get(String(item.product));
    if (!product) {
      return { ok: false, clientRef, message: "A product on this sale no longer exists" };
    }

    const quantity = Number(item.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, clientRef, message: `Invalid quantity for ${product.name}` };
    }

    // The price the customer actually paid, as printed.
    const paid = money(item.price);
    const shelf = money(product.Price);

    if (Math.abs(paid - shelf) > 0.005) {
      priceFlags.push({
        type: "price-changed",
        product: product._id,
        name: product.name,
        detail: `Sold at ${paid}; the catalogue now says ${shelf}`,
      });
    }

    lines.push({ product, quantity, price: paid, lineTotal: money(paid * quantity) });
  }

  const subtotal = money(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  // Discounts were worked out by the till against its cached catalogue. They are
  // on the customer's receipt, so they stand.
  const totalDiscount = money(Math.min(Number(sale.discount || 0), subtotal));
  const taxable = Math.max(subtotal - totalDiscount, 0);
  const tax = money(sale.taxEnabled ? taxable * Number(sale.taxRate || 0) : 0);
  const total = money(taxable + tax);

  const tenders = (Array.isArray(sale.payments) ? sale.payments : [])
    .map((entry) => ({ method: entry.method, amount: money(entry.amount) }))
    .filter((entry) => entry.amount > 0);

  if (tenders.length === 0) {
    return { ok: false, clientRef, message: "The sale has no payment" };
  }
  if (tenders.some((entry) => !PAYMENT_METHODS.includes(entry.method))) {
    return { ok: false, clientRef, message: "Unsupported payment method" };
  }

  const settledWith = tenders.length === 1 ? tenders[0].method : "split";

  const receipt = await runInTransaction(async (session) => {
    // Rebuilt on every attempt: if the transaction retries, the flags must
    // reflect that one attempt, not accumulate across all of them.
    const flags = [...priceFlags];

    const receiptNo = await receiptNumber(session);
    const saleIds = [];

    for (const line of lines) {
      // Deliberately NOT the guarded decrement used online: stock may already be
      // gone, but the sale still happened. Let it go negative and flag it — the
      // admin needs to know the count is wrong, not have the sale disappear.
      const updated = await Product.findByIdAndUpdate(
        line.product._id,
        { $inc: { quantity: -line.quantity } },
        { new: true, ...opts(session) },
      );

      if (updated && Number(updated.quantity) < 0) {
        flags.push({
          type: "negative-stock",
          product: updated._id,
          name: updated.name,
          detail: `Stock is now ${updated.quantity} — a recount is needed`,
        });
      }

      await StockTransaction.create(
        [
          {
            product: line.product._id,
            type: "Stock-out",
            quantity: line.quantity,
            supplier: line.product.supplier,
            reference: receiptNo,
          },
        ],
        opts(session),
      );

      const share = subtotal > 0 ? line.lineTotal / subtotal : 0;
      const lineDiscount = money(totalDiscount * share);
      const lineTax = money(tax * share);

      const [saleRow] = await Sale.create(
        [
          {
            customerName: sale.customerName || "Walk-in Customer",
            receiptNo,
            cashier: user._id,
            cashierName: user.name,
            products: {
              product: line.product._id,
              quantity: line.quantity,
              price: line.price,
            },
            totalAmount: money(line.lineTotal - lineDiscount + lineTax),
            discount: lineDiscount,
            tax: lineTax,
            paymentMethod: settledWith,
            paymentStatus: "paid",
            status: "completed",
            source: "pos",
            createdAt: sale.soldAt ? new Date(sale.soldAt) : undefined,
          },
        ],
        opts(session),
      );

      saleIds.push(saleRow._id);
    }

    // The till applied a voucher against its cached copy. Redeem it now, so the
    // code cannot be spent again — and if another till already spent it while we
    // were offline, the discount still stands (the customer has the receipt) but
    // the admin is told exactly what was given away twice.
    let voucherInfo;

    if (sale.voucherCode) {
      const code = String(sale.voucherCode).trim().toUpperCase();
      const amount = money(sale.voucherDiscount || 0);

      const redeemed = await Voucher.findOneAndUpdate(
        {
          code,
          status: "active",
          $expr: { $lt: ["$usedCount", "$usageLimit"] },
        },
        {
          $inc: { usedCount: 1 },
          $set: { redeemedAt: new Date(), redeemedOn: receiptNo },
        },
        { new: true, ...opts(session) },
      );

      if (redeemed) {
        if (redeemed.usedCount >= redeemed.usageLimit) {
          await Voucher.updateOne(
            { _id: redeemed._id },
            { $set: { status: "used" } },
            opts(session),
          );
        }
        voucherInfo = { code: redeemed.code, voucherId: redeemed._id, amount };
      } else {
        flags.push({
          type: "voucher-spent",
          name: code,
          detail: `Voucher ${code} was already used or is no longer valid — the ${amount} discount was still given to the customer`,
        });
        // Keep it on the receipt so the discount is traceable to a code.
        voucherInfo = { code, amount };
      }
    }

    const tendered = money(tenders.reduce((sum, entry) => sum + entry.amount, 0));

    const [created] = await Receipt.create(
      [
        {
          receiptNo,
          cashier: user._id,
          cashierName: user.name,
          customerName: sale.customerName || "Walk-in Customer",
          voucher: voucherInfo,
          items: lines.map((line) => ({
            product: line.product._id,
            name: line.product.name,
            barcode: line.product.barcode,
            quantity: line.quantity,
            price: line.price,
            lineTotal: line.lineTotal,
          })),
          subtotal,
          discount: totalDiscount,
          discountType: sale.discountType || "amount",
          dealDiscount: money(sale.dealDiscount || 0),
          deals: Array.isArray(sale.deals) ? sale.deals : [],
          taxEnabled: Boolean(sale.taxEnabled),
          taxRate: Number(sale.taxRate || 0),
          tax,
          total,
          payments: tenders,
          paymentMethod: settledWith,
          amountTendered: tendered,
          changeDue: money(Math.max(0, tendered - total)),
          status: "completed",
          saleIds,
          offline: {
            clientRef,
            ref: sale.offlineRef || clientRef,
            soldAt: sale.soldAt ? new Date(sale.soldAt) : new Date(),
            syncedAt: new Date(),
            flags,
          },
          // An offline sale is stamped with the time it actually happened, not
          // the time the network came back — otherwise the day's takings land
          // in the wrong day.
          createdAt: sale.soldAt ? new Date(sale.soldAt) : undefined,
        },
      ],
      opts(session),
    );

    return created;
  });

  // Read the flags back off the stored receipt — that is the set that actually
  // committed.
  const flags = receipt.offline?.flags || [];

  // Best-effort: tell the admin what needs looking at.
  if (flags.length > 0) {
    try {
      await Notification.create({
        name: "Offline sale needs review",
        type: `Receipt ${receipt.receiptNo} (sold offline as ${receipt.offline.ref}): ${flags
          .map((flag) => flag.detail)
          .join("; ")}`,
      });
    } catch (error) {
      console.error("Offline flag notification failed:", error.message);
    }
  }

  await raiseLowStockAlerts(
    lines.map((line) => line.product),
    `offline sale ${receipt.receiptNo}`,
  );

  await logActivity({
    action: "POS Offline Sync",
    description: `Offline sale ${receipt.offline.ref} synced as ${receipt.receiptNo}${
      flags.length ? ` with ${flags.length} flag(s)` : ""
    }.`,
    entity: "order",
    entityId: receipt._id,
    userId: user._id,
    ipAddress: ip,
  });

  return {
    ok: true,
    clientRef,
    receiptNo: receipt.receiptNo,
    offlineRef: receipt.offline.ref,
    flags: flags.length,
  };
};

// The till posts its whole queue. Each sale is settled on its own so one bad
// entry cannot block the rest — the response says exactly which refs are done,
// and the till only clears those.
module.exports.syncOfflineSales = async (req, res) => {
  try {
    const sales = Array.isArray(req.body?.sales) ? req.body.sales : [];

    if (sales.length === 0) {
      return res.status(400).json({ message: "No sales to sync" });
    }

    if (sales.length > 200) {
      return res.status(400).json({ message: "Too many sales in one batch — send at most 200" });
    }

    const results = [];

    for (const sale of sales) {
      try {
        results.push(await syncOneSale(sale, req.user, req.ip));
      } catch (error) {
        // A duplicate key here means two tabs raced on the same ref: the other
        // one won, so this is a success from the till's point of view.
        if (error.code === 11000) {
          results.push({ ok: true, duplicate: true, clientRef: sale?.clientRef });
        } else {
          console.error("Offline sync failed for", sale?.clientRef, error.message);
          results.push({ ok: false, clientRef: sale?.clientRef, message: error.message });
        }
      }
    }

    const synced = results.filter((entry) => entry.ok).length;

    return res.status(200).json({
      success: true,
      message: `${synced} of ${sales.length} sale(s) synced`,
      results,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Offline sync failed", error: error.message });
  }
};

// Correct how a sale was settled: a cashier in a hurry taps CASH when the
// customer actually paid by card. This only re-labels the tender — the totals,
// the goods and the stock are untouched.
//
// It is deliberately narrow:
//   * the receipt must still be open (a closed batch is a signed-off snapshot;
//     rewriting it would make the figures handed to the admin a lie),
//   * a cashier may only correct their own sale,
//   * the new tenders must add up to the amount already taken,
//   * and every change is written to the activity log.
module.exports.changePaymentMethod = async (req, res) => {
  try {
    const receiptNo = String(req.params.receiptNo || "").trim().toUpperCase();
    const { paymentMethod, payments } = req.body;

    const receipt = await Receipt.findOne({ receiptNo });

    if (!receipt) {
      return res.status(404).json({ message: "Receipt not found" });
    }

    // A cashier owns their own mistakes; manager and above can fix anyone's.
    const mine = String(receipt.cashier) === String(req.user._id);
    if (!mine && !canLookupAnyReceipt(req.user)) {
      return res
        .status(403)
        .json({ message: "You can only change payment on your own sales" });
    }

    if (receipt.dayClosing) {
      return res.status(400).json({
        message:
          "This sale has already been handed over at day closing and can no longer be changed",
      });
    }

    if (receipt.status === "voided" || receipt.status === "refunded") {
      return res
        .status(400)
        .json({ message: `This receipt is already ${receipt.status}` });
    }

    // Either a single method, or an explicit split.
    const tenders =
      Array.isArray(payments) && payments.length > 0
        ? payments
            .map((entry) => ({ method: entry.method, amount: money(entry.amount) }))
            .filter((entry) => entry.amount > 0)
        : paymentMethod
          ? [{ method: paymentMethod, amount: money(receipt.total) }]
          : [];

    if (tenders.length === 0) {
      return res.status(400).json({ message: "Payment method is required" });
    }

    const unsupported = tenders.find(
      (entry) => !PAYMENT_METHODS.includes(entry.method),
    );
    if (unsupported) {
      return res
        .status(400)
        .json({ message: `This till does not take ${unsupported.method}` });
    }

    // The money taken cannot change here — only how it was labelled. Anything
    // else would quietly rewrite the day's takings.
    const taken = money(tenders.reduce((sum, entry) => sum + entry.amount, 0));
    const expected = money(receipt.total);

    if (Math.abs(taken - expected) > 0.005) {
      return res.status(400).json({
        message: `The payments must add up to ${expected} — you entered ${taken}`,
        total: expected,
        entered: taken,
      });
    }

    const before = receipt.paymentMethod;
    const settledWith = tenders.length === 1 ? tenders[0].method : "split";

    receipt.payments = tenders;
    receipt.paymentMethod = settledWith;
    // The sale was settled exactly, so there is no change to hand back.
    receipt.amountTendered = expected;
    receipt.changeDue = 0;
    await receipt.save();

    // Keep the per-line Sale rows in step — the reports read those.
    await Sale.updateMany(
      { receiptNo },
      { $set: { paymentMethod: settledWith } },
    );

    await logActivity({
      action: "POS Payment Corrected",
      description: `Receipt ${receiptNo} re-tendered from ${before} to ${settledWith} by ${req.user.name}.`,
      entity: "order",
      entityId: receipt._id,
      userId: req.user._id,
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: `Payment updated to ${settledWith}`,
      receipt,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not change the payment method", error: error.message });
  }
};

// --- Day closing -----------------------------------------------------------

// Roll a batch of receipts up into the figures the admin reviews.
const summarise = (receipts) => {
  const methods = new Map();
  let gross = 0;
  let discount = 0;
  let tax = 0;
  let net = 0;
  let refunded = 0;

  for (const receipt of receipts) {
    gross += Number(receipt.subtotal || 0);
    discount += Number(receipt.discount || 0);
    tax += Number(receipt.tax || 0);
    net += Number(receipt.total || 0);
    refunded += (receipt.refunds || []).reduce(
      (sum, entry) => sum + Number(entry.amount || 0),
      0,
    );

    // A split sale carries its breakdown in payments[]; a single-tender sale
    // does not, so fall back to the settled method for the whole total.
    const hasTenders =
      Array.isArray(receipt.payments) && receipt.payments.length > 0;
    const tenders = hasTenders
      ? receipt.payments.map((tender) => ({
          method: tender.method,
          amount: Number(tender.amount || 0),
        }))
      : [{ method: receipt.paymentMethod, amount: Number(receipt.total || 0) }];

    // What was tendered is not what was kept: change goes back out of the
    // drawer. €50 handed over for a €10 sale leaves €10, not €50. Change is
    // always given in cash, so take it off the cash tender.
    const change = hasTenders ? Number(receipt.changeDue || 0) : 0;
    if (change > 0) {
      const drawer = tenders.find((tender) => tender.method === "cash") || tenders[0];
      if (drawer) drawer.amount = Math.max(0, drawer.amount - change);
    }

    for (const tender of tenders) {
      const key = tender.method || "unknown";
      const current = methods.get(key) || { method: key, amount: 0, count: 0 };
      current.amount += Number(tender.amount || 0);
      current.count += 1;
      methods.set(key, current);
    }
  }

  return {
    receiptCount: receipts.length,
    gross: money(gross),
    discount: money(discount),
    tax: money(tax),
    net: money(net),
    refunded: money(refunded),
    byMethod: [...methods.values()].map((entry) => ({
      ...entry,
      amount: money(entry.amount),
    })),
    openedAt: receipts.length ? receipts[0].createdAt : null,
  };
};

// What the cashier is about to hand over. Read-only preview.
module.exports.dayClosingSummary = async (req, res) => {
  try {
    const receipts = await Receipt.find(ownOpenScope(req.user)).sort({
      createdAt: 1,
    });

    return res.status(200).json({
      summary: summarise(receipts),
      cashierName: req.user?.name,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error building day summary", error: error.message });
  }
};

// Close the cashier's day: snapshot their open takings and stamp every receipt
// so it leaves their history and belongs to the admin from here on.
module.exports.closeDay = async (req, res) => {
  try {
    const user = req.user;

    const receipts = await Receipt.find(ownOpenScope(user)).sort({
      createdAt: 1,
    });

    if (receipts.length === 0) {
      return res
        .status(400)
        .json({ message: "There are no open sales to close" });
    }

    const summary = summarise(receipts);
    const receiptIds = receipts.map((receipt) => receipt._id);
    // Every per-line Sale row behind those receipts moves across too.
    const saleIds = receipts.flatMap((receipt) => receipt.saleIds || []);

    const closing = await runInTransaction(async (session) => {
      const seq = await nextSequence("dayClosing", session);
      const reference = `DC-${String(seq).padStart(6, "0")}`;

      const [created] = await DayClosing.create(
        [
          {
            reference,
            cashier: user._id,
            cashierName: user.name,
            cashierRole: user.role,
            openedAt: summary.openedAt,
            closedAt: new Date(),
            receiptCount: summary.receiptCount,
            receiptNos: receipts.map((receipt) => receipt.receiptNo),
            receipts: receiptIds,
            gross: summary.gross,
            discount: summary.discount,
            tax: summary.tax,
            net: summary.net,
            refunded: summary.refunded,
            byMethod: summary.byMethod,
          },
        ],
        opts(session),
      );

      // Guarded by dayClosing:null so a receipt can never be claimed by two
      // closings if the cashier double-taps.
      await Receipt.updateMany(
        { _id: { $in: receiptIds }, dayClosing: null },
        { $set: { dayClosing: created._id } },
        opts(session),
      );

      if (saleIds.length > 0) {
        await Sale.updateMany(
          { _id: { $in: saleIds }, dayClosing: null },
          { $set: { dayClosing: created._id } },
          opts(session),
        );
      }

      return created;
    });

    await logActivity({
      action: "POS Day Closing",
      description: `${user.name} closed ${summary.receiptCount} sale(s) totalling ${summary.net} as ${closing.reference}.`,
      entity: "order",
      entityId: closing._id,
      userId: user._id,
      ipAddress: req.ip,
    });

    return res.status(201).json({
      success: true,
      message: `Day closed — ${summary.receiptCount} sale(s) handed over`,
      closing,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res
      .status(status)
      .json({ message: status === 500 ? "Day closing failed" : error.message });
  }
};

// The admin's ledger of handed-over batches.
module.exports.getDayClosings = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    // Start from what this viewer is allowed to see (owner: all; manager: their
    // staff + own; staff: own), then optionally narrow to one cashier — AND-ed
    // with the scope, so a manager can't request a peer's or the admin's batches.
    const filter = closingScope(req.user);

    if (req.query.cashier) {
      if (!mongoose.isValidObjectId(req.query.cashier)) {
        return res.status(400).json({ message: "Invalid cashier id" });
      }
      filter.cashier = req.query.cashier;
    }

    const closings = await DayClosing.find(filter)
      .sort({ closedAt: -1 })
      .limit(limit);

    return res.status(200).json({ closings });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching day closings", error: error.message });
  }
};

module.exports.getDayClosing = async (req, res) => {
  try {
    const { closingId } = req.params;

    if (!mongoose.isValidObjectId(closingId)) {
      return res.status(400).json({ message: "Invalid day closing id" });
    }

    const closing = await DayClosing.findById(closingId).populate({
      path: "receipts",
      select: "receiptNo customerName total status createdAt items",
    });

    if (!closing) {
      return res.status(404).json({ message: "Day closing not found" });
    }

    // A manager may only open their staff's or their own batch, never a peer's.
    if (!canSeeClosing(req.user, closing)) {
      return res.status(403).json({ message: "You don't have access to this day closing" });
    }

    return res.status(200).json({ closing });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching day closing", error: error.message });
  }
};

module.exports.holdSale = async (req, res) => {
  try {
    const {
      customerName,
      items = [],
      discount,
      discountType,
      taxEnabled,
      voucherCode,
      till,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cannot suspend an empty sale" });
    }

    const held = await HeldSale.create({
      till,
      cashier: req.user?._id,
      cashierName: req.user?.name,
      customerName,
      items,
      discount,
      discountType,
      taxEnabled,
      voucherCode,
    });

    return res.status(201).json({ success: true, held });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Could not suspend sale", error: error.message });
  }
};

module.exports.getHeldSales = async (req, res) => {
  try {
    const held = await HeldSale.find({}).sort({ createdAt: -1 });
    return res.status(200).json({ held });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching held sales", error: error.message });
  }
};

module.exports.deleteHeldSale = async (req, res) => {
  try {
    const deleted = await HeldSale.findByIdAndDelete(req.params.heldId);

    if (!deleted) {
      return res.status(404).json({ message: "Held sale not found" });
    }

    return res
      .status(200)
      .json({ success: true, message: "Held sale removed" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error removing held sale", error: error.message });
  }
};
