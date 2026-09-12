/* What kind of sale a row is, and the colour that says so.
 *
 * Three kinds are worth picking out of a long ledger at a glance:
 *
 *   refund  — money going OUT. The most exceptional row on the page, and the
 *             one somebody scanning for "why is the total down" is looking
 *             for. Red, because it is the only one that takes money back.
 *   credit  — sold, not yet paid for. Yellow, the same colour the till's own
 *             CREDIT button wears, so the two read as the same idea.
 *   deal    — an offer was given. Purple: an ordinary sale, just a cheaper
 *             one, so it is marked without being alarming.
 *
 * ONE ROW, ONE COLOUR, and the order above is the order they win in. A refund
 * taken on credit is a refund first — the money left the drawer, which is the
 * thing to notice. A deal paid on credit is unpaid first, for the same reason:
 * the shop is owed for it.
 *
 * A deal is known from the RECEIPT, not from the sale's discount — see
 * salesController.receiptNosWithDeals. Colouring on `discount > 0` would paint
 * every hand-typed markdown as an offer.
 */

export const SALE_ROW_STYLES = {
  refund: "bg-red-50 text-red-900",
  credit: "bg-amber-50 text-amber-900",
  deal: "bg-purple-50 text-purple-900",
};

export const saleRowKind = (sale) => {
  if (sale?.source === "refund") return "refund";
  if (sale?.paymentMethod === "credit") return "credit";
  if (sale?.hadDeal) return "deal";
  return "";
};

export const saleRowClass = (sale) => SALE_ROW_STYLES[saleRowKind(sale)] || "";
