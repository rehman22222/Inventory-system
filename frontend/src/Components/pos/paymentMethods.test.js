// A sale settled by refund credit was rejected at the very last step: every
// per-line Sale row failed its enum, the transaction rolled back, and the
// cashier saw "POS checkout failed" — with the customer's money already handed
// back, because the refund is a separate transaction that had long since
// committed.
//
// The schemas have to accept every method the till can actually settle a sale
// with. Read out of the model files rather than restated here, so a fourth
// place to add a tender fails this instead of failing at a counter.
const fs = require("fs");
const path = require("path");

const backend = path.join(__dirname, "../../../../backend");
const read = (file) => fs.readFileSync(path.join(backend, file), "utf8");

// The enum as written, e.g. `enum: ["cash", "creditcard", …]`.
const enumAfter = (source, anchor) => {
  const at = source.indexOf(anchor);
  if (at === -1) return null;
  const match = source.slice(at).match(/enum:\s*\[([^\]]+)\]/);
  return match ? match[1].split(",").map((s) => s.trim().replace(/["']/g, "")) : null;
};

describe("what a sale can be settled with", () => {
  const receipt = read("models/Receiptmodel.js");
  const sale = read("models/Salesmodel.js");

  const receiptTenders = enumAfter(receipt, "payments: [");
  const receiptSettled = enumAfter(receipt, "paymentMethod: {");
  const saleSettled = enumAfter(sale, "paymentMethod: {");

  test("the models were found and parsed", () => {
    expect(receiptTenders).toContain("cash");
    expect(receiptSettled).toContain("split");
    expect(saleSettled).toContain("cash");
  });

  test("refund credit is a tender a receipt can carry", () => {
    // An exchange for something the same price or cheaper is paid for entirely
    // by the return.
    expect(receiptTenders).toContain("refund");
  });

  test("every tender is also something a sale can be settled with", () => {
    // One tender settles the whole sale, so `paymentMethod` sees each of these
    // on its own — and the per-line Sale rows are written with the same value.
    for (const method of receiptTenders) {
      expect(receiptSettled).toContain(method);
      expect(saleSettled).toContain(method);
    }
  });

  test("the Sale row accepts everything the Receipt does", () => {
    // These are written in the same transaction from the same figure. If they
    // can ever disagree, the disagreement surfaces as a failed sale.
    for (const method of receiptSettled) {
      expect(saleSettled).toContain(method);
    }
  });
});
