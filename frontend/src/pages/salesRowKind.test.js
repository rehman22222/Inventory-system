import { saleRowKind, saleRowClass, SALE_ROW_STYLES } from "./salesRowKind";

/* Which colour a row in the sales ledger wears.
 *
 * Worth pinning because the rules overlap: a refund can be taken on credit, a
 * deal can be sold on credit, and a row has one colour. Without a stated order
 * the answer would depend on which condition happened to be checked first, and
 * that is the kind of thing that changes silently when the code is tidied.
 */

describe("what kind of row a sale is", () => {
  test("an ordinary cash sale is not marked at all", () => {
    expect(saleRowKind({ source: "pos", paymentMethod: "cash" })).toBe("");
    expect(saleRowClass({ source: "pos", paymentMethod: "cash" })).toBe("");
  });

  test("a refund is a refund", () => {
    expect(saleRowKind({ source: "refund", paymentMethod: "cash" })).toBe("refund");
  });

  test("a sale on credit is credit", () => {
    expect(saleRowKind({ source: "pos", paymentMethod: "credit" })).toBe("credit");
  });

  test("a sale that got an offer is a deal", () => {
    expect(saleRowKind({ source: "pos", paymentMethod: "cash", hadDeal: true })).toBe("deal");
  });

  describe("when a row is more than one thing", () => {
    /* Money left the drawer. That is the thing somebody scanning the ledger
       for a dip in the takings is looking for, so it wins over everything. */
    test("a refund taken on credit is a refund", () => {
      expect(saleRowKind({ source: "refund", paymentMethod: "credit" })).toBe("refund");
    });

    test("a refund on a basket that had an offer is still a refund", () => {
      expect(saleRowKind({ source: "refund", paymentMethod: "cash", hadDeal: true })).toBe(
        "refund",
      );
    });

    // The shop is owed for it, which outranks the fact that it was cheap.
    test("a deal sold on credit is credit", () => {
      expect(saleRowKind({ source: "pos", paymentMethod: "credit", hadDeal: true })).toBe(
        "credit",
      );
    });
  });

  /* A deal is known from the receipt, never from the sale's own discount.
     Colouring on `discount > 0` would paint every hand-typed markdown as an
     offer, which is a different thing entirely. */
  test("a hand-discounted sale is NOT a deal", () => {
    expect(saleRowKind({ source: "pos", paymentMethod: "cash", discount: 5 })).toBe("");
  });

  test("a missing or rubbish sale is simply unmarked, and does not throw", () => {
    expect(saleRowKind(null)).toBe("");
    expect(saleRowKind(undefined)).toBe("");
    expect(saleRowKind({})).toBe("");
    expect(saleRowClass(null)).toBe("");
  });

  test("every kind has a colour, and they are all different", () => {
    const kinds = ["refund", "credit", "deal"];
    for (const kind of kinds) expect(SALE_ROW_STYLES[kind]).toBeTruthy();
    expect(new Set(Object.values(SALE_ROW_STYLES)).size).toBe(kinds.length);
  });

  // The shop asked for these three: yellow for credit, red for refund, purple
  // for a deal.
  test("the colours are the ones the shop asked for", () => {
    expect(SALE_ROW_STYLES.refund).toContain("red");
    expect(SALE_ROW_STYLES.credit).toContain("amber");
    expect(SALE_ROW_STYLES.deal).toContain("purple");
  });
});
