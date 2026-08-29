// The sales statement an accountant downloads.
//
// The claim being tested is that it ADDS UP — each line following from the one
// above — because a statement that does not reconcile is one nobody can sign
// off, however right the individual figures are:
//
//   Gross Sales − Refunds = Net Sales before Discounts
//   ... − Discounts       = Net Sales excl. Tax
//   ... + Tax             = Net Sales incl. Tax
//   ... − COGS            = Gross Profit
const { salesStatement } = require("../../../../backend/libs/salesStatement");

// The report formats with money(), which returns a string like "16.00".
const n = (value) => Math.round(Number(String(value).replace(/[^0-9.-]/g, "")) * 100) / 100;

const reconciles = (statement) => {
  const round = (value) => Math.round(value * 100) / 100;

  expect(round(n(statement.grossSales) + n(statement.returns))).toBe(
    n(statement.netBeforeDiscounts),
  );
  expect(round(n(statement.netBeforeDiscounts) + n(statement.discounts))).toBe(
    n(statement.netExTax),
  );
  expect(round(n(statement.netExTax) + n(statement.tax))).toBe(n(statement.netIncTax));
};

// A sale as checkout writes it: totalAmount = list − discount + tax.
const sale = ({ price, qty, discount = 0, tax = 0, cost = 0 }) => ({
  source: "pos",
  products: { quantity: qty, price, costPrice: cost },
  discount,
  tax,
  totalAmount: Math.round((price * qty - discount + tax) * 100) / 100,
});

// A refund as performRefund writes it: the amount and the tax negative, and the
// discount those units carried recorded positive so the report un-gives it.
const refund = ({ price, qty, paidIncTax, tax = 0, cost = 0 }) => ({
  source: "refund",
  products: { quantity: qty, price, costPrice: cost },
  tax: -tax,
  discount: Math.round((price * qty - (paidIncTax - tax)) * 100) / 100,
  totalAmount: -paidIncTax,
});

describe("the sales statement", () => {
  test("plain sales: everything is the same figure", () => {
    const statement = salesStatement([sale({ price: 10, qty: 3 }), sale({ price: 5, qty: 2 })]);

    expect(n(statement.grossSales)).toBe(40);
    expect(n(statement.netIncTax)).toBe(40);
    reconciles(statement);
  });

  test("gross sales is BEFORE returns, and the returns are their own line", () => {
    // The reported fault. Refund rows are negative, so summing every row gave a
    // figure that was already after returns while calling itself gross — and
    // the returns appeared nowhere at all.
    const statement = salesStatement([
      sale({ price: 20, qty: 2 }),
      refund({ price: 20, qty: 1, paidIncTax: 20 }),
    ]);

    expect(n(statement.grossSales)).toBe(40); // sold
    expect(n(statement.returns)).toBe(-20); // came back
    expect(n(statement.netBeforeDiscounts)).toBe(20); // the subtraction, shown
    reconciles(statement);
  });

  test("a discount is shown as a deduction, not folded into the sales figure", () => {
    const statement = salesStatement([sale({ price: 100, qty: 1, discount: 10, tax: 4.5 })]);

    expect(n(statement.grossSales)).toBe(100);
    expect(n(statement.discounts)).toBe(-10);
    expect(n(statement.netExTax)).toBe(90);
    expect(n(statement.tax)).toBe(4.5);
    expect(n(statement.netIncTax)).toBe(94.5);
    reconciles(statement);
  });

  test("returning DISCOUNTED goods un-gives the discount they carried", () => {
    // Two at 20 with 8 off, so 32 was paid. One comes back: 16 goes out, and
    // the 4 of discount on it stops being a discount the shop gave.
    //
    // Without that reversal the statement drifts: 20 before discounts less 8 of
    // discount is 12, but only 16 was ever kept.
    const statement = salesStatement([
      sale({ price: 20, qty: 2, discount: 8 }),
      refund({ price: 20, qty: 1, paidIncTax: 16 }),
    ]);

    expect(n(statement.netBeforeDiscounts)).toBe(20);
    expect(n(statement.discounts)).toBe(-4);
    expect(n(statement.netExTax)).toBe(16);
    reconciles(statement);
  });

  test("discounted goods with tax, partly returned", () => {
    const statement = salesStatement([
      sale({ price: 100, qty: 2, discount: 20, tax: 18 }),
      refund({ price: 100, qty: 1, paidIncTax: 99, tax: 9 }),
    ]);

    expect(n(statement.grossSales)).toBe(200);
    expect(n(statement.returns)).toBe(-100);
    expect(n(statement.netExTax)).toBe(90);
    expect(n(statement.tax)).toBe(9);
    expect(n(statement.netIncTax)).toBe(99);
    reconciles(statement);
  });

  test("no cost prices means no profit figure, rather than a wrong one", () => {
    // "Gross Profit €297.92" against "COGS €0.00" is revenue wearing a
    // different name — a number somebody would act on.
    const statement = salesStatement([sale({ price: 10, qty: 5 })]);

    expect(n(statement.cogs)).toBe(0);
    expect(statement.haveCost).toBe(false);
    expect(statement.grossProfit).toBeNull();
  });

  test("with cost prices, profit is net of tax less what the goods cost", () => {
    const statement = salesStatement([sale({ price: 10, qty: 5, cost: 4 })]);

    expect(statement.haveCost).toBe(true);
    expect(n(statement.cogs)).toBe(20);
    expect(n(statement.grossProfit)).toBe(30);
  });

  test("a return takes its cost back out of COGS", () => {
    const statement = salesStatement([
      sale({ price: 10, qty: 5, cost: 4 }),
      refund({ price: 10, qty: 2, paidIncTax: 20, cost: 4 }),
    ]);

    expect(n(statement.cogs)).toBe(12); // 5 sold less 2 returned, at 4
    expect(n(statement.grossProfit)).toBe(18); // 30 kept less 12
    reconciles(statement);
  });

  test("one line where some products have costs and others do not", () => {
    // Profit is still shown, because part of it is real — but it is understated
    // by whatever the uncosted goods cost, which is why the COGS line sits
    // right above it for the reader to judge.
    const statement = salesStatement([
      sale({ price: 10, qty: 1, cost: 4 }),
      sale({ price: 10, qty: 1 }),
    ]);

    expect(statement.haveCost).toBe(true);
    expect(n(statement.cogs)).toBe(4);
    expect(n(statement.grossProfit)).toBe(16);
  });

  test("an empty period is zeroes, not NaN", () => {
    const statement = salesStatement([]);

    expect(n(statement.grossSales)).toBe(0);
    expect(n(statement.netIncTax)).toBe(0);
    expect(statement.grossProfit).toBeNull();
    reconciles(statement);
  });
});
