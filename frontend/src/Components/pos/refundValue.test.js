// What a returned item is actually worth back.
//
// The rule that matters: a deal is taken off the units it covered, so an item
// in the same basket that was NOT in the deal must come back at full price.
const { paidByLine } = require("../../../../backend/libs/refundValue");

const sums = (map) =>
  Math.round([...map.values()].reduce((total, line) => total + line.paid, 0) * 100) / 100;

describe("what each line on a receipt cost", () => {
  test("no discount at all: the line is the line", () => {
    const paid = paidByLine({
      items: [{ product: "a", quantity: 2, price: 5 }],
      subtotal: 10,
      total: 10,
    });

    expect(paid.get("a").paid).toBe(10);
    expect(paid.get("a").perUnit).toBe(5);
  });

  test("a basket discount is shared out in proportion", () => {
    // €10 off €100 is 10% off everything — nothing here belongs to one line.
    const paid = paidByLine({
      items: [
        { product: "a", quantity: 1, price: 60 },
        { product: "b", quantity: 1, price: 40 },
      ],
      subtotal: 100,
      discount: 10,
      dealDiscount: 0,
      total: 90,
    });

    expect(paid.get("a").paid).toBe(54);
    expect(paid.get("b").paid).toBe(36);
    expect(sums(paid)).toBe(90);
  });

  test("a deal comes off the units it covered, and nothing else", () => {
    // The reported fault. A took the offer; B was rung at its shelf price.
    // The old split handed back 0.75 of everything, so returning B — which
    // never saw a penny of the discount — gave the customer 7.50 for a 10.00
    // item and the shop kept the difference.
    const paid = paidByLine({
      items: [
        { product: "a", quantity: 3, price: 10 },
        { product: "b", quantity: 1, price: 10 },
      ],
      subtotal: 40,
      discount: 12,
      dealDiscount: 12,
      deals: [{ amount: 12, items: [{ product: "a", quantity: 3 }] }],
      total: 28,
    });

    expect(paid.get("b").paid).toBe(10);
    expect(paid.get("a").paid).toBe(18);
    expect(paid.get("a").perUnit).toBe(6);
    expect(sums(paid)).toBe(28);
  });

  test("a deal covering only part of a line averages across that line", () => {
    // Four on the shelf, three in the offer. Which of the four came back is
    // not recorded and cannot be — so every unit of the line is worth the same.
    const paid = paidByLine({
      items: [{ product: "a", quantity: 4, price: 10 }],
      subtotal: 40,
      discount: 12,
      dealDiscount: 12,
      deals: [{ amount: 12, items: [{ product: "a", quantity: 3 }] }],
      total: 28,
    });

    expect(paid.get("a").paid).toBe(28);
    expect(paid.get("a").perUnit).toBe(7);
  });

  test("a deal and a voucher together", () => {
    // The deal lands on its units; what is left of the discount is the
    // voucher, and that is shared over what each line cost after its deal.
    const paid = paidByLine({
      items: [
        { product: "a", quantity: 3, price: 10 },
        { product: "b", quantity: 1, price: 10 },
      ],
      subtotal: 40,
      discount: 16, // 12 of deal + 4 of voucher
      dealDiscount: 12,
      deals: [{ amount: 12, items: [{ product: "a", quantity: 3 }] }],
      total: 24,
    });

    // After the deal: a is 18, b is 10, so the 4 splits 18:10.
    expect(paid.get("a").paid).toBe(15.43);
    expect(paid.get("b").paid).toBe(8.57);
    expect(sums(paid)).toBe(24);
  });

  test("tax rides along with what each line was charged", () => {
    const paid = paidByLine({
      items: [
        { product: "a", quantity: 1, price: 100 },
        { product: "b", quantity: 1, price: 100 },
      ],
      subtotal: 200,
      discount: 0,
      dealDiscount: 0,
      tax: 20,
      total: 220,
    });

    expect(paid.get("a").paid).toBe(110);
    expect(sums(paid)).toBe(220);
  });

  test("refunding every line hands back the receipt total, to the cent", () => {
    // Three lines that do not divide evenly. Somebody reconciling a drawer
    // notices a missing cent.
    const receipt = {
      items: [
        { product: "a", quantity: 1, price: 3.33 },
        { product: "b", quantity: 1, price: 3.33 },
        { product: "c", quantity: 1, price: 3.34 },
      ],
      subtotal: 10,
      discount: 1,
      dealDiscount: 0,
      total: 9,
    };

    expect(sums(paidByLine(receipt))).toBe(9);
  });

  test("a receipt from before allocations were recorded is unchanged", () => {
    // Deal money was taken off, but nothing says from where. Guessing today
    // would restate an old sale, so it keeps the proportional split it was
    // refunded by at the time.
    const paid = paidByLine({
      items: [
        { product: "a", quantity: 3, price: 10 },
        { product: "b", quantity: 1, price: 10 },
      ],
      subtotal: 40,
      discount: 12,
      dealDiscount: 12,
      deals: [{ amount: 12 }], // no items[]
      total: 28,
    });

    expect(paid.get("b").paid).toBe(7); // 0.7 x 10, as it always was
    expect(paid.get("a").paid).toBe(21);
  });

  test("with no deals it agrees with the old total/subtotal split exactly", () => {
    // The property that makes this safe to turn on: it can only move money
    // where a deal made the lines genuinely unequal.
    const receipt = {
      items: [
        { product: "a", quantity: 2, price: 7.5 },
        { product: "b", quantity: 1, price: 4 },
      ],
      subtotal: 19,
      discount: 3,
      dealDiscount: 0,
      tax: 1.6,
      total: 17.6,
    };

    const paid = paidByLine(receipt);
    for (const [key, line] of paid) {
      const item = receipt.items.find((entry) => entry.product === key);
      const old =
        Math.round((receipt.total / receipt.subtotal) * item.price * item.quantity * 100) / 100;
      expect(line.paid).toBe(old);
    }
  });

  test("an empty receipt is an empty answer, not a crash", () => {
    expect(paidByLine({ items: [], subtotal: 0, total: 0 }).size).toBe(0);
  });

  test("a free basket does not divide by zero", () => {
    const paid = paidByLine({
      items: [{ product: "a", quantity: 1, price: 0 }],
      subtotal: 0,
      total: 0,
    });

    expect(paid.get("a").paid).toBe(0);
  });
});
