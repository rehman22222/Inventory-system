/* Take a run of early sales out of the books — the ones rung up while the till
 * was being tested, before the shop started trading on it for real.
 *
 *   npm run archive-test-sales -- --to POS-000012            # dry run, changes nothing
 *   npm run archive-test-sales -- --to POS-000012 --yes      # do it
 *
 *   --from <receiptNo>   where to start (default: the first sale in the ledger)
 *   --to   <receiptNo>   the LAST sale to take, inclusive — required
 *   --reason "..."       why, recorded against the batch
 *   --yes                actually write; without it this only reports
 *
 * NOTHING IS DELETED. Every row is stamped as archived and disappears from the
 * sales list, the profit and inventory reports, the POS history, the credit
 * book and the day's takings — the same as if it had been deleted, except that
 * the batch it belongs to can be put back in one press from the Archive screen.
 * That is the difference between this and deleting rows by hand, and it is the
 * whole reason to prefer it.
 *
 * STOCK IS NOT TOUCHED. Those units left the shop, or never existed to begin
 * with; either way the count on the shelf is a separate question from whether
 * the paperwork is in the books. Putting stock back here would turn a
 * bookkeeping fix into a stocktake that is wrong by exactly this batch.
 *
 * It reuses the archive feature's own resolution rather than writing its own,
 * so what a run takes is exactly what the Archive screen would have taken:
 * whole receipts, never half of one, and the refunds that belong to them —
 * including a refund whose original sale is outside the range, because
 * archiving a return on its own would put the sale's revenue BACK.
 */

require("dotenv").config();
const mongoose = require("mongoose");

const Sale = require("../models/Salesmodel");
const Receipt = require("../models/Receiptmodel");
const DayClosing = require("../models/DayClosingmodel");
const { nextSequence } = require("../models/Countermodel");
const { summariseTakings } = require("../libs/dayClosing");
const { __testables } = require("../controller/salesArchiveController");

const { seedFilter, expandSelection, describe: summarise, recountDayClosing } = __testables;

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

const money = (n) => `€${Number(n || 0).toFixed(2)}`;

(async () => {
  const toReceiptNo = arg("to");
  const fromReceiptNo = arg("from");
  const reason = arg("reason", "Till testing before the shop started trading");
  const commit = has("yes");

  if (!toReceiptNo) {
    console.error("Which sale is the last one to take? Pass --to POS-000012");
    process.exit(1);
  }
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not configured");

  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 20_000 });
  console.log(`Connected to "${mongoose.connection.name}"\n`);

  // The same resolution the Archive screen runs. Asked for the whole ledger up
  // to the named sale when no start is given, because "everything before we
  // went live" has no lower end.
  const seed = await seedFilter(
    fromReceiptNo ? { fromReceiptNo, toReceiptNo } : { from: new Date(0).toISOString(), toReceiptNo },
  );
  const { saleIds, receipts, dayClosingIds } = await expandSelection(seed);

  if (saleIds.length === 0) {
    console.log("Nothing matched. Already archived, or the receipt number is not in the ledger.");
    await mongoose.disconnect();
    return;
  }

  const totals = await summarise(saleIds);
  const rows = await Sale.find({ _id: { $in: saleIds } })
    .select("receiptNo createdAt totalAmount source")
    .sort({ createdAt: 1 })
    .lean();

  console.log("These would go:\n");
  for (const row of rows) {
    console.log(
      `  ${String(row.receiptNo || "").padEnd(18)} ` +
        `${new Date(row.createdAt).toISOString().replace("T", " ").slice(0, 19)}  ` +
        `${money(row.totalAmount).padStart(9)}${row.source === "refund" ? "   (refund)" : ""}`,
    );
  }

  const closings = await DayClosing.find({ _id: { $in: dayClosingIds } })
    .select("reference closedAt cashierName netSales")
    .lean();

  console.log(
    `\n  ${totals.sales} sale line(s), ${totals.refunds} refund(s), ` +
      `${receipts.length} receipt(s)\n` +
      `  Revenue removed from every report: ${money(totals.revenue)}`,
  );
  if (closings.length) {
    console.log(
      `\n  ${closings.length} closed day(s) will be counted again: ` +
        closings.map((c) => `${c.reference} (was ${money(c.netSales)} net)`).join(", ") +
        "\n  Each keeps the figures it was signed off with. A day left with nothing" +
          " in it is archived along with the sales, and comes back with them.",
    );
  }

  if (!commit) {
    console.log("\nDRY RUN — nothing was written. Add --yes to do it.");
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  const seq = await nextSequence("salesArchive");
  const batch = `ARC-${String(seq).padStart(6, "0")}`;
  const stamp = {
    archivedAt: now,
    archivedBy: null,
    // No signed-in user on a script run, and the trail should say so rather
    // than name somebody who was not at the keyboard.
    archivedByName: "script: archive-test-sales",
    archiveBatch: batch,
    archiveReason: reason,
  };

  // Deliberately NOT in a transaction. This is a one-off run against a live
  // database over the public internet, where a long transaction is the thing
  // most likely to fail halfway; and the work is idempotent — a row already
  // carrying an archivedAt is invisible to the query that would stamp it, so a
  // second run after an interruption simply finishes the job.
  const stampedSales = await Sale.updateMany({ _id: { $in: saleIds } }, { $set: stamp });
  const stampedReceipts = await Receipt.updateMany(
    { _id: { $in: receipts.map((r) => r._id) } },
    { $set: stamp },
  );

  console.log(
    `\nArchived as ${batch}: ` +
      `${stampedSales.modifiedCount} sale row(s), ${stampedReceipts.modifiedCount} receipt(s).`,
  );

  // After the stamps, never before: the recount counts what is LEFT.
  for (const id of dayClosingIds) {
    const done = await recountDayClosing(
      id,
      { at: now, by: null, byName: stamp.archivedByName, batch, reason },
      null,
    );
    if (!done) continue;
    console.log(
      done.emptied
        ? `  ${done.reference} had nothing left in it and was archived too` +
          ` (was ${money(done.was.netSales)} net)`
        : `  ${done.reference} recounted: net sales ${money(done.was.netSales)}` +
          ` → ${money(done.now.netSales)}`,
    );
  }

  console.log(
    `\nDone. To put it all back: Sales → Archive sales → Already archived → ${batch} → Put back.`,
  );
  await mongoose.disconnect();
})().catch(async (error) => {
  console.error("\narchive-test-sales failed:", error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
