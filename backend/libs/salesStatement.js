/* The sales statement, as an accountant reads it.
 *
 * Each line follows from the one above, and the whole thing reconciles by
 * construction rather than by coincidence:
 *
 *   Gross Sales   − Refunds   = Net Sales before Discounts
 *   ...           − Discounts = Net Sales excl. Tax
 *   ...           + Tax       = Net Sales incl. Tax
 *   ...           − COGS      = Gross Profit
 *
 * Two things this exists to stop:
 *
 *   · "Gross Sales" used to be the sum of every row INCLUDING the negative
 *     refund ones. That figure is already after returns while calling itself
 *     gross, and the returns themselves appear nowhere — so a month with €41 of
 *     returns looked like a month with none. Sold and returned are accumulated
 *     apart now, and the subtraction is shown.
 *
 *   · "Gross Profit" against a COGS of zero is revenue wearing a different
 *     name. With no cost prices in the catalogue there is no profit figure to
 *     give, and saying so is more use than a confident wrong number.
 *
 * Pure: it takes Sale rows and returns figures, so the arithmetic can be run
 * and checked on its own. A statement is only worth anything if it adds up, and
 * "it adds up" is a testable claim.
 */

// Two decimal places as a string, the way the report renders every figure.
const money = (value) => (Math.round(Number(value || 0) * 100) / 100).toFixed(2);

const salesStatement = (rows = []) => {
  let grossSales = 0; // sold, at list price
  let returnsList = 0; // came back, at list price
  let totalDiscount = 0;
  let totalTax = 0;
  let netRevenue = 0; // what was actually charged, tax included
  let netOfTax = 0;
  let totalCost = 0;
  let haveCost = false;

  for (const row of rows) {
    // A refund row reverses an earlier sale: the goods came back, so its value
    // AND its cost are subtracted rather than added.
    const sign = row.source === "refund" ? -1 : 1;
    const qty = sign * Number(row.products?.quantity || 0);
    const unitPrice = Number(row.products?.price || 0);
    // populate() puts the product on `products.product`; a plain fixture may
    // carry the cost directly.
    const unitCost = Number(
      row.products?.product?.costPrice || row.products?.costPrice || 0,
    );

    const lineList = unitPrice * qty;
    const lineTax = Number(row.tax || 0); // already signed with the row

    if (sign < 0) returnsList += -lineList;
    else grossSales += lineList;

    // A refund row records the discount its units carried as a positive, so
    // this reversal turns it into a reduction in discounts given — which is
    // what returning discounted goods actually is. Without it the statement
    // drifts by exactly the discount on the returned units.
    totalDiscount += sign * Number(row.discount || 0);
    totalTax += lineTax;
    netRevenue += Number(row.totalAmount || 0); // already signed
    netOfTax += Number(row.totalAmount || 0) - lineTax;
    totalCost += unitCost * qty;

    // Whether ANY line here knows what its goods cost.
    if (unitCost > 0) haveCost = true;
  }

  return {
    grossSales: money(grossSales),
    returns: money(-returnsList),
    netBeforeDiscounts: money(grossSales - returnsList),
    discounts: money(-totalDiscount),
    netExTax: money(netOfTax),
    tax: money(totalTax),
    netIncTax: money(netRevenue),
    cogs: money(totalCost),
    haveCost,
    grossProfit: haveCost ? money(netOfTax - totalCost) : null,
  };
};

module.exports = { salesStatement };
