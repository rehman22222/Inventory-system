const mongoose = require("mongoose");
const Product = require("../models/Productmodel");
const Sale = require("../models/Salesmodel");
const StockTransaction = require("../models/StockTranscationmodel");
const Notification = require("../models/Notificationmodel");
const Receipt = require("../models/Receiptmodel");
const Voucher = require("../models/Vouchermodel");
const HeldSale = require("../models/HeldSalemodel");
const { nextSequence } = require("../models/Countermodel");
const { runInTransaction } = require("../libs/txn");
const logActivity = require("../libs/logger");

const LOW_STOCK_THRESHOLD = 10;

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

const opts = (session) => (session ? { session } : {});

const receiptNumber = async (session) => {
  const seq = await nextSequence("receipt", session);
  return `POS-${String(seq).padStart(6, "0")}`;
};

// Best-effort side effects. A failure here must never fail a completed sale.
const raiseLowStockAlerts = async (products, reference) => {
  try {
    const low = products.filter(
      (product) => product.quantity <= LOW_STOCK_THRESHOLD,
    );
    await Promise.all(
      low.map((product) =>
        Notification.create({
          name: "Low stock alert",
          type: `${product.name} has ${product.quantity} units remaining after ${reference}.`,
        }),
      ),
    );
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

    // --- Pass 1: validate everything before mutating anything. A bad item at
    // position 3 must not leave items 1 and 2 already sold.
    const lines = [];

    for (const item of items) {
      // A malformed id would otherwise throw a CastError and surface as an
      // opaque 500.
      if (!mongoose.isValidObjectId(item.product)) {
        return res
          .status(400)
          .json({ message: `Invalid product id: ${item.product}` });
      }

      const product = await Product.findById(item.product);

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
      voucher = await Voucher.findOne({
        code: String(voucherCode).trim().toUpperCase(),
      });

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

    const totalDiscount = money(voucherDiscount + manualDiscount);
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
        for (const line of lines) {
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

          const [stockTx] = await StockTransaction.create(
            [
              {
                product: updated._id,
                type: "Stock-out",
                quantity: line.quantity,
                supplier: updated.supplier,
                reference: receiptNo,
              },
            ],
            opts(session),
          );

          undo.stockTx.push(stockTx._id);

          // Spread discount and tax across the lines in proportion to their value
          // so that the Sale rows sum back to the receipt total.
          const share = subtotal > 0 ? line.lineTotal / subtotal : 0;
          const lineDiscount = money(totalDiscount * share);
          const lineTax = money(tax * share);

          const [sale] = await Sale.create(
            [
              {
                customerName,
                receiptNo,
                cashier: cashierId,
                cashierName,
                products: {
                  product: updated._id,
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
              },
            ],
            opts(session),
          );

          saleIds.push(sale._id);
          undo.sales.push(sale._id);
        }

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

    await raiseLowStockAlerts(
      lines.map((line) => line.product),
      `POS sale ${receipt.receiptNo}`,
    );

    await logActivity({
      action: "POS Checkout",
      description: `Receipt ${receipt.receiptNo} completed for ${customerName}.`,
      entity: "order",
      entityId: receipt._id,
      userId: cashierId,
      ipAddress: req.ip,
    });

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
    const query = Receipt.findOne({ receiptNo });
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

    const receipts = await Receipt.find({})
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.status(200).json({ receipts });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching receipts", error: error.message });
  }
};

module.exports.getReceipt = async (req, res) => {
  try {
    const receipt = await Receipt.findOne({
      receiptNo: String(req.params.receiptNo).trim().toUpperCase(),
    });

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
