// The day-closing arithmetic, which decides what a cashier hands over.
//
// Tested from here because jest lives on this side; the function itself is
// backend/libs/dayClosing.js and is pure, so it needs nothing but receipts.
const { summariseTakings } = require("../../../../backend/libs/dayClosing");

// A completed sale. `payments` is what was tendered; leaving it off means the
// whole total settled on `paymentMethod`, which is how a single-tender sale is
// actually stored.
const sale = ({ total, method = "cash", payments, refunds = [], ...rest }) => ({
  total,
  subtotal: total,
  paymentMethod: method,
  ...(payments ? { payments } : {}),
  refunds,
  ...rest,
});

describe("what a shift came to", () => {
  test("a cash sale with nothing returned is all three figures at once", () => {
    const summary = summariseTakings([sale({ total: 100 })]);

    expect(summary.grossSales).toBe(100);
    expect(summary.netSales).toBe(100);
    expect(summary.expectedCash).toBe(100);
  });

  test("a cash refund comes off the takings AND the drawer", () => {
    // The reported bug: this used to say 100 in both places, and the shift that
    // handed over 70 was recorded as handing over 100.
    const summary = summariseTakings([
      sale({
        total: 100,
        refunds: [{ amount: 30, method: "cash" }],
      }),
    ]);

    expect(summary.grossSales).toBe(100);
    expect(summary.netSales).toBe(70);
    expect(summary.expectedCash).toBe(70);
  });

  test("a card refund comes off the card, not the cash", () => {
    const summary = summariseTakings([
      sale({
        total: 100,
        method: "creditcard",
        refunds: [{ amount: 30, method: "creditcard" }],
      }),
    ]);

    expect(summary.expectedCard).toBe(70);
    expect(summary.expectedCash).toBe(0);
    expect(summary.netSales).toBe(70);
  });

  test("a card sale handed back in cash takes it out of the till", () => {
    // Ordinary at a counter, and the reason a refund carries its own method:
    // the terminal keeps its 100 and the drawer is 30 down.
    const summary = summariseTakings([
      sale({
        total: 100,
        method: "creditcard",
        refunds: [{ amount: 30, method: "cash" }],
      }),
    ]);

    expect(summary.expectedCard).toBe(100);
    expect(summary.expectedCash).toBe(-30);
    expect(summary.netSales).toBe(70);
  });

  test("an exchange takes nothing out of the drawer", () => {
    // 30 returned, 30 spent on the replacement, nothing handed over. The
    // replacement is the second receipt: real revenue, tendered by credit from
    // the return, which is money on paper and nothing in the till.
    const summary = summariseTakings([
      sale({
        total: 30,
        refunds: [{ amount: 30, method: "cash", exchangeCredit: 30 }],
      }),
      sale({ total: 30, method: "refund", payments: [{ method: "refund", amount: 30 }] }),
    ]);

    expect(summary.refundAmount).toBe(30);
    expect(summary.exchangeCredit).toBe(30);
    expect(summary.cashHandedBack).toBe(0);
    // The 30 the customer paid at the start is STILL IN THE DRAWER — they left
    // with a different item, not with their money. Subtracting the refund here
    // would report an empty till and send someone hunting for 30 that never
    // moved. This is the case the exchangeCredit field exists for.
    expect(summary.expectedCash).toBe(30);
    // Sold 30, replaced 30, refunded 30: the customer paid once and has one
    // item, so the shop kept 30. Counting the credit again would report 0.
    expect(summary.netSales).toBe(30);
  });

  test("a part-cash exchange only removes the part that was handed over", () => {
    // Returned 50, took a 30 replacement, 20 back in cash.
    const summary = summariseTakings([
      sale({
        total: 50,
        refunds: [{ amount: 50, method: "cash", exchangeCredit: 30 }],
      }),
      sale({ total: 30, method: "refund", payments: [{ method: "refund", amount: 30 }] }),
    ]);

    expect(summary.cashHandedBack).toBe(20);
    expect(summary.expectedCash).toBe(30); // 50 taken in, 20 handed back
  });

  test("mixed tenders and mixed refunds each land on their own method", () => {
    const summary = summariseTakings([
      sale({ total: 100 }),
      sale({ total: 60, method: "creditcard" }),
      sale({
        total: 40,
        method: "split",
        payments: [
          { method: "cash", amount: 25 },
          { method: "creditcard", amount: 15 },
        ],
        refunds: [{ amount: 10, method: "cash" }],
      }),
    ]);

    expect(summary.grossSales).toBe(200);
    expect(summary.netSales).toBe(190);
    expect(summary.expectedCash).toBe(115); // 100 + 25 - 10
    expect(summary.expectedCard).toBe(75); // 60 + 15
  });

  test("several partial refunds on one receipt all count", () => {
    const summary = summariseTakings([
      sale({
        total: 100,
        refunds: [
          { amount: 10, method: "cash" },
          { amount: 15, method: "cash" },
          { amount: 5, method: "creditcard" },
        ],
      }),
    ]);

    expect(summary.refundAmount).toBe(30);
    expect(summary.netSales).toBe(70);
    expect(summary.expectedCash).toBe(75); // 100 in, 25 back
    expect(summary.expectedCard).toBe(-5); // never taken, still handed back
  });

  test("a voided receipt contributes nothing", () => {
    const summary = summariseTakings([
      sale({
        total: 100,
        status: "voided",
        refunds: [{ amount: 100, method: "cash", reason: "void" }],
      }),
    ]);

    expect(summary.grossSales).toBe(100);
    expect(summary.netSales).toBe(0);
    expect(summary.expectedCash).toBe(0);
  });

  test("a refund with no stated method went back the way the sale came in", () => {
    // Every row written before refunds carried a method, and every void.
    const summary = summariseTakings([
      sale({ total: 100, method: "creditcard", refunds: [{ amount: 30 }] }),
    ]);

    expect(summary.expectedCard).toBe(70);
    expect(summary.expectedCash).toBe(0);
  });

  test("a sale on account is not takings", () => {
    // The goods went and the money did not, so there is nothing to hand over
    // for it — but it is still a sale and still on the slip.
    const summary = summariseTakings([
      sale({ total: 100, method: "credit", payments: [{ method: "credit", amount: 100 }] }),
    ]);

    expect(summary.grossSales).toBe(100);
    expect(summary.netSales).toBe(100);
    expect(summary.expectedCash).toBe(0);
    expect(summary.byMethod.find((row) => row.method === "credit").expected).toBe(0);
  });

  test("change handed back is not takings", () => {
    const summary = summariseTakings([
      sale({
        total: 90,
        payments: [{ method: "cash", amount: 100 }],
        changeDue: 10,
      }),
    ]);

    expect(summary.expectedCash).toBe(90);
  });

  test("a method that only ever refunded still shows up", () => {
    const summary = summariseTakings([
      sale({ total: 100, refunds: [{ amount: 20, method: "creditcard" }] }),
    ]);

    const card = summary.byMethod.find((row) => row.method === "creditcard");
    expect(card).toBeDefined();
    expect(card.amount).toBe(0);
    expect(card.refunded).toBe(20);
    expect(card.expected).toBe(-20);
  });

  test("an empty shift is zeroes, not NaN", () => {
    const summary = summariseTakings([]);

    expect(summary.receiptCount).toBe(0);
    expect(summary.netSales).toBe(0);
    expect(summary.expectedCash).toBe(0);
    expect(summary.byMethod).toEqual([]);
  });

  test("the old fields keep their old meaning", () => {
    // Stored DayClosing documents and the admin screens have always read these.
    const summary = summariseTakings([
      sale({ total: 100, refunds: [{ amount: 30, method: "cash" }] }),
    ]);

    expect(summary.net).toBe(100); // sales total, BEFORE refunds
    expect(summary.refunded).toBe(30);
  });
});

describe("money taken back against the book", () => {
  test("a sale on account is revenue but not takings", () => {
    // The goods went and the money did not. It counts as a sale — the shop is
    // owed it — and there is nothing in the drawer for it.
    const summary = summariseTakings([
      sale({ total: 50, method: "credit", payments: [{ method: "credit", amount: 50 }] }),
    ]);

    expect(summary.grossSales).toBe(50);
    expect(summary.netSales).toBe(50);
    expect(summary.expectedCash).toBe(0);
    expect(summary.creditRepaid).toBe(0);
  });

  test("a repayment is takings but not revenue", () => {
    // The mirror image, and the reason it cannot simply be added to sales: the
    // €50 was booked the day the account was opened. Counting it again here
    // would book the same goods twice.
    const summary = summariseTakings([], [{ amount: 50, method: "cash" }]);

    expect(summary.grossSales).toBe(0);
    expect(summary.netSales).toBe(0);
    expect(summary.creditRepaid).toBe(50);
    expect(summary.expectedCash).toBe(50);
  });

  test("a repayment lands on the method it was taken by", () => {
    const summary = summariseTakings([], [{ amount: 30, method: "creditcard" }]);

    expect(summary.expectedCard).toBe(30);
    expect(summary.expectedCash).toBe(0);
  });

  test("sold on account today, part-paid today", () => {
    // Both halves on one shift: €50 on the book, €20 of it back in cash.
    const summary = summariseTakings(
      [sale({ total: 50, method: "credit", payments: [{ method: "credit", amount: 50 }] })],
      [{ amount: 20, method: "cash" }],
    );

    expect(summary.grossSales).toBe(50); // the sale, once
    expect(summary.creditRepaid).toBe(20);
    expect(summary.expectedCash).toBe(20); // only what was handed over
    expect(summary.byMethod.find((row) => row.method === "credit").expected).toBe(0);
  });

  test("part cash, part account, in one sale", () => {
    const summary = summariseTakings([
      sale({
        total: 100,
        method: "split",
        payments: [
          { method: "cash", amount: 60 },
          { method: "credit", amount: 40 },
        ],
      }),
    ]);

    expect(summary.grossSales).toBe(100);
    expect(summary.expectedCash).toBe(60); // the 40 is owed, not held
  });

  test("repayments and refunds meet on the same method without cancelling wrongly", () => {
    const summary = summariseTakings(
      [sale({ total: 100, refunds: [{ amount: 30, method: "cash" }] })],
      [{ amount: 25, method: "cash" }],
    );

    // 100 in, 25 back against the book, 30 handed out again.
    expect(summary.expectedCash).toBe(95);
    // The repayment is not revenue, so the sales figures are untouched by it.
    expect(summary.netSales).toBe(70);
  });

  test("a repayment with no method is cash, because that is what a counter takes", () => {
    const summary = summariseTakings([], [{ amount: 10 }]);
    expect(summary.expectedCash).toBe(10);
  });

  test("no repayments at all leaves every figure where it was", () => {
    const withNone = summariseTakings([sale({ total: 40 })]);
    const withEmpty = summariseTakings([sale({ total: 40 })], []);

    expect(withEmpty).toEqual(withNone);
    expect(withNone.creditRepaid).toBe(0);
  });
});
