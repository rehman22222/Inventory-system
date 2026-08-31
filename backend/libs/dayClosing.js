/* What a shift actually came to.
 *
 * Three different questions get asked of a day closing, and they have three
 * different answers. Reporting them as one number is how a drawer comes up
 * short with nobody able to say why:
 *
 *   1. What were the sales worth?      → grossSales   (before anything went back)
 *   2. What did the shop keep?         → netSales     (gross minus refunds)
 *   3. What should be in the drawer?   → expectedCash (cash in, minus cash out)
 *
 * A €100 cash sale with a €30 cash refund is €100 gross, €70 net and €70 in the
 * till. The old summary answered all three with €100 — the sales were summed
 * and the refunds were reported beside them, never subtracted — so the shift
 * that handed over €70 was recorded as handing over €100.
 *
 * Two things make the drawer figure subtler than "sales minus refunds":
 *
 *   · Refunds go back by a method of their own. A card sale handed back in cash
 *     takes money out of the till and leaves the card terminal untouched, so
 *     refunds are subtracted from the method they actually went out by, not
 *     from the one the sale came in on.
 *
 *   · An exchange spends the refund on the replacement instead of paying it
 *     out. Nothing leaves the drawer for that part, so it must not be
 *     subtracted from it. It is not lost either: the replacement is rung up as
 *     an ordinary sale tendered by "refund", which is money on the receipt and
 *     nothing in the till — so it stays out of the cash and card columns and
 *     the arithmetic closes on its own, with no second subtraction anywhere.
 *
 * Historical receipts are never touched. Everything here is derived at read
 * time from what was already written.
 */

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

// Tenders that are not money in a drawer or on a terminal. "credit" is a sale
// on account — the goods went and the payment did not — and "refund" is credit
// from a return being spent. Both belong on the slip; neither is takings.
const NON_CASH_TENDERS = new Set(["credit", "refund"]);

// What a refund actually took out of the till, and by which method.
//
// `exchangeCredit` is the part that was spent on a replacement rather than
// handed over, so only the remainder crossed the counter. A refund with no
// stated method went back the way the sale came in, which is what a void does
// and what every row written before the method existed assumed.
const cashOutOf = (entry, receipt) => ({
  method: entry.method || receipt.paymentMethod || "unknown",
  // Two parts of a refund never reach the drawer: value spent on a
  // replacement, and value that cancelled a debt the customer had not paid.
  // Only what survives both was actually handed over.
  amount: Math.max(
    0,
    money(
      Number(entry.amount || 0) -
        Number(entry.exchangeCredit || 0) -
        Number(entry.debtCancelled || 0),
    ),
  ),
});

// `creditTaken` is money handed over TODAY against accounts sold whenever:
// [{ amount, method }]. It is not revenue — that was booked on the day of the
// sale — but it is in the drawer now, and a count that ignores it comes up
// over by exactly this much.
const summariseTakings = (receipts = [], creditTaken = []) => {
  const sales = new Map(); // method -> { amount, count } taken in
  const refunds = new Map(); // method -> amount actually handed back

  let gross = 0; // subtotal before discount — kept for the existing slip line
  let discount = 0;
  let tax = 0;
  let grossSales = 0; // what the sales were worth, refunds not yet counted
  let refundAmount = 0; // the value returned to customers
  let exchangeCredit = 0; // the part of that spent on replacements
  let debtCancelled = 0; // the part that cancelled an unpaid account

  for (const receipt of receipts) {
    gross += Number(receipt.subtotal || 0);
    discount += Number(receipt.discount || 0);
    tax += Number(receipt.tax || 0);
    grossSales += Number(receipt.total || 0);

    for (const entry of receipt.refunds || []) {
      refundAmount += Number(entry.amount || 0);
      exchangeCredit += Number(entry.exchangeCredit || 0);
      debtCancelled += Number(entry.debtCancelled || 0);

      const out = cashOutOf(entry, receipt);
      if (out.amount > 0) {
        refunds.set(out.method, money((refunds.get(out.method) || 0) + out.amount));
      }
    }

    // A split sale carries its breakdown in payments[]; a single-tender sale
    // does not, so fall back to the settled method for the whole total.
    const hasTenders = Array.isArray(receipt.payments) && receipt.payments.length > 0;
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
      const current = sales.get(key) || { method: key, amount: 0, count: 0 };
      current.amount += Number(tender.amount || 0);
      current.count += 1;
      sales.set(key, current);
    }
  }

  // Repayments land on the method they were taken by, alongside the sales.
  // They are deliberately NOT added to grossSales or netSales: the goods left
  // the shop on the day of the sale and were counted then. Counting them
  // again here would book the same revenue twice.
  let creditRepaid = 0;
  for (const entry of creditTaken || []) {
    const key = entry?.method || "cash";
    const amount = Number(entry?.amount || 0);
    if (amount <= 0) continue;

    creditRepaid += amount;
    const current = sales.get(key) || { method: key, amount: 0, count: 0 };
    current.amount += amount;
    current.count += 1;
    sales.set(key, current);
  }

  // One row per method that saw anything at all, in or out, so a method that
  // only ever refunded still appears rather than vanishing from the count.
  const methods = new Set([...sales.keys(), ...refunds.keys()]);
  const byMethod = [...methods].map((method) => {
    const taken = sales.get(method) || { amount: 0, count: 0 };
    const back = refunds.get(method) || 0;

    return {
      method,
      // `amount` stays what it always was — money taken in on this method —
      // because the stored records and every screen already read it that way.
      amount: money(taken.amount),
      count: taken.count,
      refunded: money(back),
      // What should be there at the end. Meaningless for a sale on account or
      // for credit spent on an exchange, since neither is money.
      expected: NON_CASH_TENDERS.has(method) ? 0 : money(taken.amount - back),
    };
  });

  const expectedFor = (method) => byMethod.find((row) => row.method === method)?.expected || 0;

  return {
    receiptCount: receipts.length,
    openedAt: receipts.length ? receipts[0].createdAt : null,

    gross: money(gross),
    discount: money(discount),
    tax: money(tax),

    grossSales: money(grossSales),
    refundAmount: money(refundAmount),
    exchangeCredit: money(exchangeCredit),
    // Refunds counted once, here. The exchange half reconciles through the
    // replacement sale's own line above, so it is not subtracted twice.
    netSales: money(grossSales - refundAmount),
    // What actually went back over the counter, as opposed to what was
    // refunded on paper.
    cashHandedBack: money(refundAmount - exchangeCredit - debtCancelled),
    // Refund value that went against an unpaid account instead of being
    // handed over.
    debtCancelled: money(debtCancelled),

    // What came back against the book today. In the drawer, not in the sales.
    creditRepaid: money(creditRepaid),

    expectedCash: expectedFor("cash"),
    expectedCard: expectedFor("creditcard"),

    byMethod,

    // Unchanged meaning, kept because the stored DayClosing documents and the
    // admin screens have always read them: `net` is the sales total BEFORE
    // refunds. Anything asking "what was handed over" wants netSales or
    // expectedCash instead.
    net: money(grossSales),
    refunded: money(refundAmount),
  };
};

module.exports = { summariseTakings, NON_CASH_TENDERS };
