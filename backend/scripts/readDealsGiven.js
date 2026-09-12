/* Have any sales actually been rung up with a deal on them?
 *
 *   node scripts/readDealsGiven.js
 *
 * READ ONLY. It opens the database, counts, prints, and disconnects. There is
 * no create, update or delete anywhere in this file, and it must stay that way
 * — it exists to answer a question about the live shop, which is the one place
 * a careless script does real damage.
 *
 * WHERE A DEAL IS RECORDED. On the RECEIPT, not on the sale row: one receipt is
 * often several sale lines, and an offer belongs to the basket. `dealDiscount`
 * is what the offer took off; `deals[]` names which ones were given.
 *
 * Archived receipts are counted SEPARATELY. The archive hook hides them from
 * ordinary reads, and "none found" would otherwise be ambiguous between "never
 * happened" and "happened and was archived".
 */

require("dotenv").config();
const mongoose = require("mongoose");

const Receipt = require("../models/Receiptmodel");

const money = (n) => `€${Number(n || 0).toFixed(2)}`;
const day = (d) => new Date(d).toISOString().slice(0, 10);

(async () => {
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not configured");
  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 20_000 });
  console.log(`Connected to "${mongoose.connection.name}" — reading only\n`);

  const since = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

  const withDeal = await Receipt.find({ dealDiscount: { $gt: 0 } })
    .select("receiptNo createdAt dealDiscount deals total")
    .sort({ createdAt: 1 })
    .lean();

  const allReceipts = await Receipt.countDocuments({});
  const recentReceipts = await Receipt.countDocuments({ createdAt: { $gte: since } });

  // The same question asked of rows the archive is hiding.
  const archivedWithDeal = await Receipt.countDocuments(
    { dealDiscount: { $gt: 0 } },
    { withArchived: true },
  ).catch(() => null);

  console.log("EVERY SALE ON RECORD");
  console.log(`  receipts in the books:            ${allReceipts}`);
  console.log(`  of those, with a deal applied:    ${withDeal.length}`);
  if (archivedWithDeal !== null && archivedWithDeal !== withDeal.length) {
    console.log(`  including archived ones:          ${archivedWithDeal}`);
  }

  console.log("\nTHE LAST 8 DAYS");
  const recent = withDeal.filter((r) => new Date(r.createdAt) >= since);
  console.log(`  receipts:                         ${recentReceipts}`);
  console.log(`  of those, with a deal applied:    ${recent.length}`);

  if (withDeal.length) {
    const given = withDeal.reduce((sum, r) => sum + Number(r.dealDiscount || 0), 0);
    console.log(`\n  Total given away by offers:       ${money(given)}`);
    console.log(`  First:                            ${day(withDeal[0].createdAt)}`);
    console.log(`  Last:                             ${day(withDeal[withDeal.length - 1].createdAt)}`);

    console.log("\n  The most recent ten:");
    for (const r of withDeal.slice(-10)) {
      const names = (r.deals || []).map((d) => d.name).filter(Boolean).join(", ");
      console.log(
        `    ${String(r.receiptNo || "").padEnd(16)} ${day(r.createdAt)}  ` +
          `${money(r.dealDiscount).padStart(9)}  ${names}`,
      );
    }
  } else {
    console.log("\n  No sale has ever been rung up with a deal on it.");
  }

  await mongoose.disconnect();
})().catch(async (error) => {
  console.error("\nread failed:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
