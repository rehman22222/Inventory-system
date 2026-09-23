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
 * Refunds have to be gathered by hand: they are not on receipt.saleIds. A
 * refund writes its own negative Sale row, and there are TWO threads back to
 * the receipt, because the till has written them two ways.
 *
 *   RFD-<receiptNo>  — what performRefund writes today. The refund row's own
 *                      number is the original's with a prefix, and NOTHING in
 *                      that receipt's refunds[] points back at it.
 *   RFD-<sequence>   — an older form, still sitting in refunds[] on rows this
 *                      shop already has.
 *
 * Both are followed, in both directions. Following only refunds[].reference
 * looked right and quietly missed every refund written the modern way —
 * archiving a sale and leaving its return behind, so the shop's revenue went
 * UP by the refund. That is the exact bug this function exists to prevent, and
 * it was live until a dry run over real data showed a refund missing from a
 * batch that plainly should have held it. */
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
      // The same reached from the other side, for a refund picked on its own:
      // its original's number is its own, less the prefix.
      {
        receiptNo: {
          $in: seedNos
            .filter((no) => no.startsWith("RFD-"))
            .map((no) => no.slice("RFD-".length)),
        },
      },
    ],
  })
    .select("_id receiptNo saleIds refunds dayClosing total createdAt cashierName")
    .lean();

  const saleIds = new Set(seedIds);
  for (const receipt of receipts) {
    for (const id of receipt.saleIds || []) saleIds.add(String(id));
  }

  const refundRefs = [
    ...new Set([
      // What the receipt itself recorded, whichever form it took.
      ...receipts.flatMap((receipt) =>
        (receipt.refunds || []).map((entry) => entry.reference).filter(Boolean),
      ),
      // …and the form today's refunds carry, DERIVED rather than read: a
      // receipt refunded this way has nothing in refunds[] naming the row.
      ...receipts.map((receipt) => `RFD-${receipt.receiptNo}`),
    ]),
  ].filter(Boolean);
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

  /* The figures as they stand, kept only the FIRST time this day is restated,
   * so a second archive against it cannot overwrite the signed-off originals
   * with already-adjusted ones.
   *
   * Tested on `adjusted.batch` rather than on `adjusted.was` itself, because
   * Mongoose materialises nested paths whether or not they hold anything: on a
   * closing that has never been touched, `adjusted` is {} and `adjusted.was`
   * is {} — both truthy, so a `||` fallback here never fired and the originals
   * were recorded as an empty object. `batch` is written only by an actual
   * restatement, so its presence is the honest test. */
  const was = closing.adjusted?.batch
    ? closing.adjusted.was
    : {
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

  /* Written as an update of the figures that changed, NOT as a save().
   *
   * save() re-validates the whole document, and this one was written by a
   * cashier's day closing possibly years and several schema revisions ago. A
   * field that has since become required, or a value that has since left an
   * enum, would make an unrelated old record refuse to be restated — and the
   * archive would fail with something that has nothing to do with the sales
   * being archived.
   *
   * Only these figures are ours to change. The rest of the closing — who
   * closed it, when, its reference — is theirs and is left exactly alone. */
  const restated = {
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
  };

  /* A day with nothing left in it goes with the sales.
   *
   * Restating it to zero would leave a closing on the list swearing that a
   * cashier worked a shift and took nothing — which is not what happened, and
   * is worse than the day simply not being there. It is ARCHIVED, not deleted,
   * carrying the same batch as the sales, so putting them back puts the day
   * back with them. */
  const emptied = receipts.length === 0;

  await DayClosing.updateOne(
    { _id: closing._id },
    {
      $set: emptied
        ? {
            ...restated,
            archivedAt: stamp.at,
            archivedBy: stamp.by,
            archivedByName: stamp.byName,
            archiveBatch: stamp.batch,
            archiveReason: stamp.reason,
          }
        : restated,
    },
    { session: session || undefined },
  );
  return { reference: closing.reference, was, now: { netSales: summary.netSales }, emptied };
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
    // The browser is told little on purpose; the terminal is told all of it.
    console.error("[sales-archive] previewArchive failed:", error);
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
      entity: "sale",
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
    // The browser is told little on purpose; the terminal is told all of it.
    console.error("[sales-archive] archiveSales failed:", error);

    /* And into the audit trail, where the shop can actually reach it.
     *
     * On the live server nobody sees that console line, and a 5xx body is
     * replaced with "Something went wrong" before it reaches the browser
     * (see server.js) — which is right for a browser and leaves the one
     * person allowed to run this with nothing to go on. The activity log is
     * already superadmin-only and already where the successful archives are
     * recorded, so a failed one belongs beside them.
     *
     * Awaited so the response cannot land before the record exists, and
     * logActivity swallows its own failures, so this can never turn one
     * error into two. */
    await logActivity({
      action: "archive-sales-failed",
      entity: "sale",
      description: `Archiving failed: ${error.message || "no reason given"}`,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

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
    // The browser is told little on purpose; the terminal is told all of it.
    console.error("[sales-archive] listArchives failed:", error);
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
      // The days that were emptied by this batch come back with it.
      await DayClosing.updateMany(
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
      entity: "sale",
      description: `Restored archive ${batch}: ${rows.length} sale row(s) back in the books`,
      userId: req.user._id,
      ipAddress: req.ip,
    });

    return res
      .status(200)
      .json({ success: true, batch, restored: rows.length, dayClosings: dayClosingIds.length });
  } catch (error) {
    // The browser is told little on purpose; the terminal is told all of it.
    console.error("[sales-archive] restoreArchive failed:", error);

    /* And into the audit trail, where the shop can actually reach it.
     *
     * On the live server nobody sees that console line, and a 5xx body is
     * replaced with "Something went wrong" before it reaches the browser
     * (see server.js) — which is right for a browser and leaves the one
     * person allowed to run this with nothing to go on. The activity log is
     * already superadmin-only and already where the successful archives are
     * recorded, so a failed one belongs beside them.
     *
     * Awaited so the response cannot land before the record exists, and
     * logActivity swallows its own failures, so this can never turn one
     * error into two. */
    await logActivity({
      action: "restore-archive-failed",
      entity: "sale",
      description: `Restoring failed: ${error.message || "no reason given"}`,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    return res
      .status(500)
      .json({ success: false, message: error.message || "Could not restore that archive" });
  }
};

/* The only rows a purge may ever touch.
 *
 * `archivedAt` is named as well as the batch. libs/archivable.js hides archived
 * rows from find, count, update and aggregate — but NOT from deletes, so
 * nothing upstream of here would stop a delete reaching a live row that
 * happened to carry a batch label. Naming the flag makes "only what is already
 * out of the books" a property of the query rather than of how it is called.
 *
 * One function, used by all three deletes and asserted on by the tests, so the
 * rule cannot drift apart from the thing that checks it. */
const purgeFilter = (batch) => ({ archiveBatch: batch, archivedAt: { $ne: null } });

/* What an archive is made of, and what destroying it would cost. Read-only, so
 * the confirmation can be built from the same counts the deletion will use. */
async function weigh(batch) {
  const sales = await Sale.find({ archiveBatch: batch })
    .setOptions({ withArchived: true })
    .select("_id totalAmount source createdAt receiptNo")
    .sort({ createdAt: 1 })
    .lean();

  const receipts = await Receipt.find({ archiveBatch: batch })
    .setOptions({ withArchived: true })
    .select("_id")
    .lean();

  // Days that went with the batch come back with a restore; days that merely
  // had their figures restated do not, and after a purge they never can.
  const retired = await DayClosing.find({ archiveBatch: batch })
    .setOptions({ withArchived: true })
    .select("reference")
    .lean();

  const restated = await DayClosing.find({
    "adjusted.batch": batch,
    archiveBatch: null,
  })
    .setOptions({ withArchived: true })
    .select("reference")
    .lean();

  const refunds = sales.filter((row) => row.source === "refund");

  return {
    sales: sales.length - refunds.length,
    refunds: refunds.length,
    revenue: money(sales.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0)),
    receipts: receipts.length,
    retiredDayClosings: retired.map((row) => row.reference),
    restatedDayClosings: restated.map((row) => row.reference),
    first: sales[0] ? { receiptNo: sales[0].receiptNo, at: sales[0].createdAt } : null,
    last: sales.at(-1) ? { receiptNo: sales.at(-1).receiptNo, at: sales.at(-1).createdAt } : null,
  };
}

// What destroying an archive would take with it, without taking it.
module.exports.previewPurge = async (req, res) => {
  try {
    const batch = String(req.params.batch || "").trim();
    if (!batch) return res.status(400).json({ success: false, message: "Which archive?" });

    const weight = await weigh(batch);
    if (weight.sales + weight.refunds === 0) {
      return res.status(404).json({ success: false, message: "No such archive" });
    }

    return res.status(200).json({ success: true, batch, ...weight });
  } catch (error) {
    console.error("[sales-archive] previewPurge failed:", error);
    return res
      .status(error.status || 500)
      .json({ success: false, message: error.message || "Could not read that archive" });
  }
};

/* Destroying an archive for good.
 *
 * Everything above this line exists to avoid exactly this, and for the shop's
 * trade that reasoning has not changed: sales are archived, never deleted, and
 * "put back" is one press away. But not everything in the ledger is trade. A
 * till is proved before it goes live — a few sales rung against real products
 * to watch the receipt print and the stock move — and those rows are not a
 * record of anything that happened in a shop. Archived they are invisible but
 * permanent, and the ledger carries a batch of pretend takings for ever.
 *
 * So this is deliberately the narrow door:
 *
 *   - Stock is not touched, exactly as archiving does not touch it. The count
 *     moved when the sale was rung; whether the paperwork survives is a
 *     separate question from what is on the shelf, and a delete that quietly
 *     restocked would be a stocktake nobody asked for. Put stock back with a
 *     refund, before archiving, or set it by hand afterwards.
 *   - What went is written to the activity log, which is not something this
 *     endpoint can delete. The rows go; the record that they existed stays.
 */
module.exports.purgeArchive = async (req, res) => {
  try {
    const batch = String(req.params.batch || "").trim();
    if (!batch) return res.status(400).json({ success: false, message: "Which archive?" });

    const weight = await weigh(batch);
    if (weight.sales + weight.refunds === 0) {
      return res.status(404).json({ success: false, message: "No such archive" });
    }

    const archived = purgeFilter(batch);

    const removed = await runInTransaction(async (session) => {
      const sales = await Sale.deleteMany(archived, { session });
      const receipts = await Receipt.deleteMany(archived, { session });
      // Only the days this batch emptied and retired. A day that is still
      // trading, and was merely restated, is somebody's signed-off shift.
      const dayClosings = await DayClosing.deleteMany(archived, { session });

      return {
        sales: sales.deletedCount || 0,
        receipts: receipts.deletedCount || 0,
        dayClosings: dayClosings.deletedCount || 0,
      };
    });

    /* Written after the rows are gone and awaited before the answer goes back,
     * so the trail cannot say a deletion happened that did not. */
    await logActivity({
      action: "purge",
      entity: "sale",
      description:
        `Permanently deleted archive ${batch}: ${removed.sales} sale row(s), ` +
        `${removed.receipts} receipt(s) and ${removed.dayClosings} day closing(s), ` +
        `worth ${weight.revenue}, covering ${weight.first?.receiptNo || "?"} to ` +
        `${weight.last?.receiptNo || "?"}. Stock was not changed.`,
      userId: req.user._id,
      ipAddress: req.ip,
    });

    return res.status(200).json({ success: true, batch, ...removed, revenue: weight.revenue });
  } catch (error) {
    console.error("[sales-archive] purgeArchive failed:", error);

    await logActivity({
      action: "purge-archive-failed",
      entity: "sale",
      description: `Permanent delete failed: ${error.message || "no reason given"}`,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    return res
      .status(error.status || 500)
      .json({ success: false, message: error.message || "Could not delete that archive" });
  }
};

/* Destroying a selection of sales outright, without archiving them first.
 *
 * The shop asked for this beside the Archive button, and the reason is the
 * reason the archive exists: the rows rung to prove a till are not trade.
 * Making somebody archive them, find the batch and then delete it is three
 * steps to undo something that was never meant to be in the books.
 *
 * It is NOT a different code path. The selection goes through the same
 * resolution the archive uses, the rows are stamped with a batch, the day
 * closings are restated against what is left, and only then are the stamped
 * rows deleted. That order is what keeps the guarantees the archive earned:
 *
 *   - a receipt goes whole, never half of one
 *   - a refund travels with the sale it reverses, so revenue cannot go UP
 *   - a day that was signed off is restated, and says so on its face
 *   - a day left empty goes with the batch
 *   - stock is not touched, and the money leaves the books
 *
 * What it does not have is a way back. The batch exists for the length of one
 * transaction and is gone with the rows, so there is nothing to restore from —
 * which is the whole point, and why the activity log entry is written with
 * everything anybody would need to know what was here.
 */
module.exports.purgeSales = async (req, res) => {
  try {
    const reason = String(req.body?.reason || "").trim() || "Deleted permanently";

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

      // After the stamps and BEFORE the deletes: the recount reads what is
      // left, and these rows are only invisible to it once they are stamped.
      const restated = [];
      for (const id of dayClosingIds) {
        const done = await recountDayClosing(
          id,
          { at: stamp.archivedAt, by: req.user._id, byName: req.user.name, batch, reason },
          session,
        );
        if (done) restated.push(done);
      }

      const archived = purgeFilter(batch);
      const goneSales = await Sale.deleteMany(archived, { session });
      const goneReceipts = await Receipt.deleteMany(archived, { session });
      const goneDays = await DayClosing.deleteMany(archived, { session });

      return {
        batch,
        restated,
        sales: goneSales.deletedCount || 0,
        receipts: goneReceipts.deletedCount || 0,
        dayClosings: goneDays.deletedCount || 0,
      };
    });

    await logActivity({
      action: "purge",
      entity: "sale",
      description:
        `Permanently deleted ${result.sales} sale row(s) and ${result.receipts} receipt(s) ` +
        `(${totals.sales} sale(s), ${totals.refunds} refund(s)) worth ${totals.revenue}, ` +
        `covering ${totals.first?.receiptNo || "?"} to ${totals.last?.receiptNo || "?"}, ` +
        `plus ${result.dayClosings} emptied day closing(s). Reason: ${reason}. ` +
        "Stock was not changed.",
      userId: req.user._id,
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      ...totals,
      sales: result.sales,
      receipts: result.receipts,
      dayClosings: result.dayClosings,
      dayClosingsRestated: result.restated,
    });
  } catch (error) {
    console.error("[sales-archive] purgeSales failed:", error);

    await logActivity({
      action: "purge-sales-failed",
      entity: "sale",
      description: `Permanent delete failed: ${error.message || "no reason given"}`,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    return res
      .status(error.status || 500)
      .json({ success: false, message: error.message || "Could not delete those sales" });
  }
};

/* Exported for the archive's own tests, which drive the two pieces where a
 * mistake would be silent: what a selection resolves to, and what it drags in
 * with it. Not part of the HTTP surface. */
module.exports.__testables = {
  seedFilter,
  expandSelection,
  describe,
  recountDayClosing,
  weigh,
  purgeFilter,
};
