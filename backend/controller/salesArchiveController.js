const mongoose = require("mongoose");
const Sale = require("../models/Salesmodel");
const Receipt = require("../models/Receiptmodel");
const DayClosing = require("../models/DayClosingmodel");
const { nextSequence } = require("../models/Countermodel");
const { runInTransaction } = require("../libs/txn");
const { summariseTakings } = require("../libs/dayClosing");
const logActivity = require("../libs/logger");

/* Taking a run of sales out of the shop's books.
 *
 * The shop was deleting rows out of the database by hand — a day of testing, a
 * till left running through a demo, a batch rung up against the wrong shop.
 * That works exactly once and leaves nothing behind: no way back, no record of
 * who did it, and a day closing still swearing to totals whose sales no longer
 * exist.
 *
 * This is the same outcome without the shovel. Nothing is deleted. A row is
 * stamped as archived, and libs/archivable.js hides archived rows from every
 * read on Sale and Receipt — so the sales list, the profit report, the POS
 * history, the credit book and the online/counter split all stop counting it
 * at once, with no query anywhere needing to know this feature exists.
 *
 * WHAT IS DELIBERATELY NOT TOUCHED: stock. The goods left the shop. Archiving
 * the paperwork does not walk them back onto the shelf, and a feature that
 * silently restocked would turn a bookkeeping fix into a stocktake that is
 * wrong by exactly the archive. Restocking is what a refund is for, and it
 * stays that way.
 */

const money = (value) => Math.round(Number(value || 0) * 100) / 100;
const idsOf = (docs) => docs.map((doc) => String(doc._id));
const isId = (value) => mongoose.isValidObjectId(String(value));

/* ── Working out what the superadmin actually selected ────────────────────── */

/* A selection names sales in one of four ways, and they combine: tick a few
 * rows, or give a window of time, or say "from this sale to that one".
 *
 * Whichever way it is asked, it lands on the same thing — a set of Sale rows —
 * and everything after this point works on that set. */
async function seedFilter(body) {
  const { saleIds, receiptNos, from, to, fromReceiptNo, toReceiptNo } = body || {};
  const clauses = [];

  const ids = (Array.isArray(saleIds) ? saleIds : []).filter(isId);
  if (ids.length) clauses.push({ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } });

  const nos = (Array.isArray(receiptNos) ? receiptNos : [])
    .map((no) => String(no).trim())
    .filter(Boolean);
  if (nos.length) clauses.push({ receiptNo: { $in: nos } });

  // A window of time. Both ends optional, so "everything before X" and
  // "everything since X" are the same request with one end left off.
  const window = {};
  if (from && !Number.isNaN(Date.parse(from))) window.$gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) window.$lte = new Date(to);
  if (Object.keys(window).length) clauses.push({ createdAt: window });

  /* "From this sale to that sale" is a window too, once the two receipts have
   * been looked up. Resolved to the times they were rung up rather than
   * compared as strings: receipt numbers are sequential and zero-padded, but
   * they are not the only prefix in the ledger — refunds are RFD-, the web
   * writes its own — and a string range across two prefixes selects things
   * nobody pointed at. Times are what the cashier means by "from here to
   * there" anyway. */
  if (fromReceiptNo || toReceiptNo) {
    const ends = await Sale.find({
      receiptNo: { $in: [fromReceiptNo, toReceiptNo].filter(Boolean).map(String) },
    })
      .select("receiptNo createdAt")
      .sort({ createdAt: 1 })
      .lean();

    if (ends.length === 0) {
      const error = new Error("Neither of those receipt numbers is in the sales ledger");
      error.status = 404;
      throw error;
    }

    const span = {};
    if (fromReceiptNo) {
      const start = ends.find((row) => row.receiptNo === String(fromReceiptNo));
      if (start) span.$gte = start.createdAt;
    }
    if (toReceiptNo) {
      const end = [...ends].reverse().find((row) => row.receiptNo === String(toReceiptNo));
      // Inclusive of the sale that was named. Two sales inside the same second
      // are ordinary at a busy till, so the end of the window is the end of
      // that second rather than the instant of the row itself.
      if (end) span.$lte = new Date(new Date(end.createdAt).getTime() + 999);
    }
    if (Object.keys(span).length) clauses.push({ createdAt: span });
  }

  if (clauses.length === 0) {
    const error = new Error("Nothing was selected");
    error.status = 400;
    throw error;
  }

  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

/* One selected sale drags its whole receipt in with it.
 *
 * A receipt is one transaction, and half of one archived is worse than either
 * end of the choice: the sales list would show a basket missing two of its five
 * lines, and the receipt would still print a total that no longer matches what
 * is behind it. So the seed is only ever a way IN — what gets archived is every
 * receipt the seed touches, whole, plus the refunds that were put through
 * against those receipts.
 *
 * Refunds have to be gathered by hand because they are not on receipt.saleIds:
 * a refund writes its own negative Sale row under its own RFD- reference, and
 * the only thread back to the receipt is the reference in receipt.refunds[].
 * Miss them and archiving a sale leaves its refund behind as a credit the shop
 * appears to have given against nothing. */
async function expandSelection(seed) {
  const seedSales = await Sale.find(seed).select("_id receiptNo").lean();
  if (seedSales.length === 0) {
    return { saleIds: [], receipts: [], dayClosingIds: [] };
  }

  const seedIds = idsOf(seedSales);
  const seedNos = [...new Set(seedSales.map((row) => row.receiptNo).filter(Boolean))];

  const receipts = await Receipt.find({
    $or: [
      { saleIds: { $in: seedIds.map((id) => new mongoose.Types.ObjectId(id)) } },
      { receiptNo: { $in: seedNos } },
      // A refund found on its own, reached from the other end.
      //
      // A refund row is not on any receipt's saleIds and its receiptNo is its
      // own RFD- reference, so neither clause above can see it. Without this a
      // window containing a return but not the sale it reverses archives the
      // negative row alone and leaves the sale — and the shop's revenue goes UP
      // by the refund. The thread back is the reference in receipt.refunds[].
      { "refunds.reference": { $in: seedNos } },
    ],
  })
    .select("_id receiptNo saleIds refunds dayClosing total createdAt cashierName")
    .lean();

  const saleIds = new Set(seedIds);
  for (const receipt of receipts) {
    for (const id of receipt.saleIds || []) saleIds.add(String(id));
  }

  const refundRefs = receipts.flatMap((receipt) =>
    (receipt.refunds || []).map((entry) => entry.reference).filter(Boolean),
  );
  if (refundRefs.length) {
    const refundRows = await Sale.find({ receiptNo: { $in: refundRefs } }).select("_id").lean();
    for (const id of idsOf(refundRows)) saleIds.add(id);
  }

  const dayClosingIds = [
    ...new Set(receipts.map((receipt) => receipt.dayClosing).filter(Boolean).map(String)),
  ];

  return { saleIds: [...saleIds], receipts, dayClosingIds };
}

/* What the archive comes to, in the figures the superadmin is about to remove.
 *
 * Shown before anything happens, because "archive 214 sales" is not a sentence
 * anybody can check. "Archive 214 sales worth EUR 4,182.50, including 3 refunds,
 * across 2 closed days" is. */
async function describe(saleIds) {
  if (saleIds.length === 0) {
    return { sales: 0, revenue: 0, refunds: 0, refundValue: 0, first: null, last: null };
  }

  const rows = await Sale.find({ _id: { $in: saleIds } })
    .select("totalAmount source createdAt receiptNo")
    .sort({ createdAt: 1 })
    .lean();

  const refunds = rows.filter((row) => row.source === "refund");
  return {
    sales: rows.length - refunds.length,
    // The net effect on the books: refund rows are already negative, so this is
    // what the reports will drop by.
    revenue: money(rows.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0)),
    refunds: refunds.length,
    refundValue: money(refunds.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0)),
    first: rows[0] ? { receiptNo: rows[0].receiptNo, at: rows[0].createdAt } : null,
    last: rows.at(-1) ? { receiptNo: rows.at(-1).receiptNo, at: rows.at(-1).createdAt } : null,
  };
}

/* ── Day closings ─────────────────────────────────────────────────────────── */

/* A day closing is a snapshot, and it is stored rather than derived ON PURPOSE:
 * it is the record of a shift somebody handed over and signed for, and
 * recomputing it later from today's rules would quietly restate what they
 * signed. That reasoning is still right, and it is why this does not happen
 * quietly — the closing keeps its original figures in `adjusted.was`, and says
 * on its face that it was restated, by whom and for which archive.
 *
 * The recount itself reads the same two sources the closing read when it was
 * made: the receipts stamped with it, and the credit repayments stamped with
 * it. Archived receipts are already invisible to both, so this is simply the
 * same sum over what is left. */
async function recountDayClosing(dayClosingId, stamp, session) {
  const closing = await DayClosing.findById(dayClosingId).session(session || null);
  if (!closing) return null;

  const receipts = await Receipt.find({ dayClosing: closing._id })
    .sort({ createdAt: 1 })
    .session(session || null);

  const holders = await Receipt.find({
    "credit.payments.dayClosing": closing._id,
  })
    .select("receiptNo credit")
    .session(session || null);

  const creditTaken = holders.flatMap((receipt) =>
    (receipt.credit?.payments || [])
      .filter((entry) => String(entry.dayClosing) === String(closing._id))
      .map((entry) => ({
        receiptNo: receipt.receiptNo,
        reference: entry.reference,
        at: entry.at,
        amount: money(entry.amount),
        method: entry.method || "cash",
      })),
  );

  const summary = summariseTakings(receipts, creditTaken);

  // Kept only the first time, so a second archive against the same day does not
  // overwrite the original with an already-adjusted one.
  const was = closing.adjusted?.was || {
    receiptCount: closing.receiptCount,
    gross: closing.gross,
    discount: closing.discount,
    tax: closing.tax,
    net: closing.net,
    refunded: closing.refunded,
    grossSales: closing.grossSales,
    refundAmount: closing.refundAmount,
    netSales: closing.netSales,
    expectedCash: closing.expectedCash,
    expectedCard: closing.expectedCard,
  };

  closing.set({
    receiptCount: summary.receiptCount,
    receiptNos: receipts.map((receipt) => receipt.receiptNo),
    receipts: receipts.map((receipt) => receipt._id),
    gross: summary.gross,
    discount: summary.discount,
    tax: summary.tax,
    net: summary.net,
    refunded: summary.refunded,
    exchangeCredit: summary.exchangeCredit,
    grossSales: summary.grossSales,
    refundAmount: summary.refundAmount,
    netSales: summary.netSales,
    cashHandedBack: summary.cashHandedBack,
    creditRepaid: summary.creditRepaid,
    expectedCash: summary.expectedCash,
    expectedCard: summary.expectedCard,
    byMethod: summary.byMethod,
    adjusted: {
      at: stamp.at,
      by: stamp.by,
      byName: stamp.byName,
      batch: stamp.batch,
      reason: stamp.reason,
      was,
    },
  });

  await closing.save({ session: session || undefined });
  return { reference: closing.reference, was, now: { netSales: summary.netSales } };
}

/* ── The endpoints ────────────────────────────────────────────────────────── */

// What would go, without anything going. Every archive is confirmed against
// this, and it runs the same resolution the archive itself runs — one code
// path, so the confirmation cannot describe a different set from the one that
// is removed.
module.exports.previewArchive = async (req, res) => {
  try {
    const seed = await seedFilter(req.body);
    const { saleIds, receipts, dayClosingIds } = await expandSelection(seed);
    const totals = await describe(saleIds);

    const closings = await DayClosing.find({ _id: { $in: dayClosingIds } })
      .select("reference closedAt cashierName netSales")
      .lean();

    return res.status(200).json({
      success: true,
      ...totals,
      receipts: receipts.length,
      receiptNos: receipts.map((receipt) => receipt.receiptNo),
      dayClosings: closings,
    });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ success: false, message: error.message || "Could not work out that selection" });
  }
};

module.exports.archiveSales = async (req, res) => {
  try {
    const reason = String(req.body?.reason || "").trim();
    if (!reason) {
      return res
        .status(400)
        .json({ success: false, message: "Say why these sales are being archived" });
    }

    const seed = await seedFilter(req.body);
    const { saleIds, receipts, dayClosingIds } = await expandSelection(seed);
    if (saleIds.length === 0) {
      return res.status(404).json({ success: false, message: "That selection matched no sales" });
    }

    const totals = await describe(saleIds);

    const result = await runInTransaction(async (session) => {
      const seq = await nextSequence("salesArchive", session);
      const batch = `ARC-${String(seq).padStart(6, "0")}`;
      const stamp = {
        archivedAt: new Date(),
        archivedBy: req.user._id,
        archivedByName: req.user.name,
        archiveBatch: batch,
        archiveReason: reason,
      };

      await Sale.updateMany({ _id: { $in: saleIds } }, { $set: stamp }, { session });
      await Receipt.updateMany(
        { _id: { $in: receipts.map((receipt) => receipt._id) } },
        { $set: stamp },
        { session },
      );

      // After the stamps, never before: the recount reads what is LEFT, and the
      // archived rows are only invisible to it once they carry the flag.
      const restated = [];
      for (const id of dayClosingIds) {
        const done = await recountDayClosing(
          id,
          { at: stamp.archivedAt, by: req.user._id, byName: req.user.name, batch, reason },
          session,
        );
        if (done) restated.push(done);
      }

      return { batch, restated };
    });

    await logActivity({
      action: "archive",
      entity: "Sale",
      description:
        `Archived ${totals.sales} sale(s) and ${totals.refunds} refund(s) across ` +
        `${receipts.length} receipt(s), worth ${totals.revenue}, as ${result.batch}. ` +
        `Reason: ${reason}`,
      userId: req.user._id,
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      batch: result.batch,
      ...totals,
      receipts: receipts.length,
      dayClosingsRestated: result.restated,
    });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ success: false, message: error.message || "Could not archive those sales" });
  }
};

// Every archive ever taken, newest first — the record the hand-run DELETE never
// left, and the way back to anything archived by mistake.
module.exports.listArchives = async (req, res) => {
  try {
    const batches = await Sale.aggregate([
      { $match: { archivedAt: { $ne: null } } },
      {
        $group: {
          _id: "$archiveBatch",
          at: { $first: "$archivedAt" },
          byName: { $first: "$archivedByName" },
          reason: { $first: "$archiveReason" },
          sales: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
          firstAt: { $min: "$createdAt" },
          lastAt: { $max: "$createdAt" },
        },
      },
      { $sort: { at: -1 } },
      { $limit: 200 },
    ]).option({ withArchived: true });

    return res.status(200).json({
      success: true,
      archives: batches.map((row) => ({
        batch: row._id,
        at: row.at,
        byName: row.byName,
        reason: row.reason,
        sales: row.sales,
        revenue: money(row.revenue),
        coversFrom: row.firstAt,
        coversTo: row.lastAt,
      })),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: error.message || "Could not read the archives" });
  }
};

// Put one back, exactly as it was. The whole reason the rows were kept.
module.exports.restoreArchive = async (req, res) => {
  try {
    const batch = String(req.params.batch || "").trim();
    if (!batch) return res.status(400).json({ success: false, message: "Which archive?" });

    const rows = await Sale.find({ archiveBatch: batch })
      .setOptions({ withArchived: true })
      .select("_id")
      .lean();
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "No such archive" });
    }

    const receipts = await Receipt.find({ archiveBatch: batch })
      .setOptions({ withArchived: true })
      .select("_id dayClosing")
      .lean();

    const dayClosingIds = [
      ...new Set(receipts.map((receipt) => receipt.dayClosing).filter(Boolean).map(String)),
    ];

    const clear = {
      archivedAt: null,
      archivedBy: null,
      archivedByName: null,
      archiveBatch: null,
      archiveReason: null,
    };

    await runInTransaction(async (session) => {
      await Sale.updateMany(
        { archiveBatch: batch },
        { $set: clear },
        { session, withArchived: true },
      );
      await Receipt.updateMany(
        { archiveBatch: batch },
        { $set: clear },
        { session, withArchived: true },
      );

      // The days those receipts belong to count them again, so they are
      // recounted a second time and land back on their original figures.
      for (const id of dayClosingIds) {
        await recountDayClosing(
          id,
          {
            at: new Date(),
            by: req.user._id,
            byName: req.user.name,
            batch,
            reason: `Restored from ${batch}`,
          },
          session,
        );
      }
    });

    await logActivity({
      action: "restore",
      entity: "Sale",
      description: `Restored archive ${batch}: ${rows.length} sale row(s) back in the books`,
      userId: req.user._id,
      ipAddress: req.ip,
    });

    return res
      .status(200)
      .json({ success: true, batch, restored: rows.length, dayClosings: dayClosingIds.length });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, message: error.message || "Could not restore that archive" });
  }
};

/* Exported for the archive's own tests, which drive the two pieces where a
 * mistake would be silent: what a selection resolves to, and what it drags in
 * with it. Not part of the HTTP surface. */
module.exports.__testables = { seedFilter, expandSelection, describe, recountDayClosing };
