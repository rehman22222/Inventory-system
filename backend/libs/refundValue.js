/* What each line on a receipt actually cost.
 *
 * A refund should hand back what was paid for the thing being returned, and
 * that is not the same as the line's share of the receipt. Discounts do not all
 * behave alike:
 *
 *   · A voucher or a hand-typed discount is taken off the basket. Every line
 *     carried a share of it, in proportion to what it was worth.
 *
 *   · A deal is taken off NAMED UNITS. "Any 3 for €18" reduces the three units
 *     it covered and nothing else — a fourth item in the same basket was sold
 *     at its shelf price and has to be refunded at its shelf price.
 *
 * Spreading everything by receipt.total / receipt.subtotal treats the second
 * like the first, so returning the full-price item hands back less than the
 * customer paid for it and the shop quietly keeps the difference. The receipt
 * already records which units each offer covered (`deals[].items`), so the
 * answer is there to be read rather than estimated.
 *
 * Receipts written before that allocation was recorded fall back to the old
 * proportional split — a refund on a historical sale must return what it would
 * always have returned, not what today's rules would say.
 *
 * With no deals in the basket the two agree exactly: proportional-after-
 * discount plus a proportional share of tax is algebraically the same as
 * total/subtotal. The change only ever moves money where a deal made the lines
 * genuinely unequal.
 */

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

// Does this receipt know which units its offers covered? A basket that took no
// deal discount needs no allocation and is not "legacy" for this purpose.
const hasDealAllocation = (receipt) => {
  const dealDiscount = Number(receipt.dealDiscount || 0);
  if (dealDiscount <= 0) return true;

  return (receipt.deals || []).some((deal) =>
    (deal.items || []).some((item) => Number(item.quantity || 0) > 0),
  );
};

/* What each line was actually paid for, keyed by product id.
 *
 * Returns Map(productId -> { quantity, paid, perUnit }) where the paid figures
 * sum to receipt.total. Per unit is an average across the line: a line of three
 * where a deal covered two does not record which of the three came back, and
 * averaging is the only answer that does not depend on guessing.
 */
const paidByLine = (receipt) => {
  const items = receipt.items || [];
  const subtotal = Number(receipt.subtotal || 0);
  const discount = Number(receipt.discount || 0);
  const dealDiscount = Number(receipt.dealDiscount || 0);
  const tax = Number(receipt.tax || 0);
  const total = Number(receipt.total || 0);

  const result = new Map();
  if (items.length === 0) return result;

  const legacy = !hasDealAllocation(receipt);

  // Shelf value of each line, and the unit price to spread deal discounts by.
  const shelf = items.map((item) => ({
    key: String(item.product),
    quantity: Number(item.quantity || 0),
    price: Number(item.price || 0),
    value: money(Number(item.price || 0) * Number(item.quantity || 0)),
  }));

  if (legacy || subtotal <= 0) {
    // Exactly what planRefund did before allocations existed.
    const ratio = subtotal > 0 ? total / subtotal : 0;
    for (const line of shelf) {
      const paid = money(ratio * line.value);
      result.set(line.key, {
        quantity: line.quantity,
        paid,
        perUnit: line.quantity > 0 ? paid / line.quantity : 0,
        // Old receipts spread tax the same proportional way, so its share of
        // the line is the same proportion of the tax.
        taxPerUnit:
          line.quantity > 0 && subtotal > 0
            ? (Number(receipt.tax || 0) * (line.value / subtotal)) / line.quantity
            : 0,
      });
    }
    return result;
  }

  // 1. Deal discounts land on the units the offer actually covered, split
  //    between them by what those units are worth.
  const dealOff = new Map();
  for (const deal of receipt.deals || []) {
    const covered = (deal.items || [])
      .map((entry) => {
        const line = shelf.find((row) => row.key === String(entry.product));
        const quantity = Math.min(
          Number(entry.quantity || 0),
          line ? line.quantity : 0,
        );
        return line && quantity > 0
          ? { key: line.key, value: line.price * quantity }
          : null;
      })
      .filter(Boolean);

    const coveredValue = covered.reduce((sum, entry) => sum + entry.value, 0);
    if (coveredValue <= 0) continue;

    const amount = Number(deal.amount || 0);
    for (const entry of covered) {
      dealOff.set(
        entry.key,
        (dealOff.get(entry.key) || 0) + (amount * entry.value) / coveredValue,
      );
    }
  }

  // 2. Whatever is left of the discount was taken off the basket as a whole —
  //    a voucher, or a figure the cashier typed — so every line carries a share
  //    of it in proportion to what it was worth after its deals.
  const afterDeals = shelf.map((line) => ({
    ...line,
    value: Math.max(0, line.value - (dealOff.get(line.key) || 0)),
  }));
  const afterDealsTotal = afterDeals.reduce((sum, line) => sum + line.value, 0);
  const basketDiscount = Math.max(0, discount - dealDiscount);

  const taxable = afterDeals.map((line) => ({
    ...line,
    value:
      afterDealsTotal > 0
        ? Math.max(
            0,
            line.value - (basketDiscount * line.value) / afterDealsTotal,
          )
        : 0,
  }));
  const taxableTotal = taxable.reduce((sum, line) => sum + line.value, 0);

  // 3. Tax was worked out on the whole taxable base, so it comes back the same
  //    way.
  const paid = taxable.map((line) => ({
    key: line.key,
    quantity: line.quantity,
    // Kept apart from the total: a refund reverses revenue AND the tax that
    // was collected on it, and a report that cannot tell the two apart counts
    // tax as profit going out.
    tax: taxableTotal > 0 ? (tax * line.value) / taxableTotal : 0,
    paid: line.value + (taxableTotal > 0 ? (tax * line.value) / taxableTotal : 0),
  }));

  // 4. Round, then give the last cent or two to the largest line, so refunding
  //    every line hands back the receipt total exactly rather than a cent under
  //    it. Somebody reconciling a drawer notices that cent.
  const rounded = paid.map((line) => ({ ...line, paid: money(line.paid) }));
  const drift = money(total - rounded.reduce((sum, line) => sum + line.paid, 0));

  if (drift !== 0 && rounded.length > 0) {
    const biggest = rounded.reduce((a, b) => (b.paid > a.paid ? b : a));
    biggest.paid = money(biggest.paid + drift);
  }

  for (const line of rounded) {
    result.set(line.key, {
      quantity: line.quantity,
      paid: line.paid,
      perUnit: line.quantity > 0 ? line.paid / line.quantity : 0,
      taxPerUnit: line.quantity > 0 ? money(line.tax) / line.quantity : 0,
    });
  }

  return result;
};

module.exports = { paidByLine, hasDealAllocation };
