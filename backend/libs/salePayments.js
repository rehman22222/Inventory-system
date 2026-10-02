const Receipt = require("../models/Receiptmodel");

const cents = (value) => Math.round(Number(value || 0) * 100);

// Allocate a line's charged value, never the entire receipt on every product.
function allocatePayments(sale, receipt) {
  const total = cents(sale.totalAmount);
  if (sale.paymentMethod !== "split") {
    return [{ method: sale.paymentMethod, amount: total / 100 }];
  }
  if (!receipt?.payments?.length) return [{ method: "split", amount: total / 100 }];
  const amounts = new Map();
  for (const payment of receipt.payments) {
    amounts.set(payment.method, (amounts.get(payment.method) || 0) + cents(payment.amount));
  }
  // The till returns overpayment as cash change.
  if (amounts.has("cash")) amounts.set("cash", Math.max(0, amounts.get("cash") - cents(receipt.changeDue)));
  const tenders = [...amounts].filter(([, amount]) => amount > 0);
  const paid = tenders.reduce((sum, [, amount]) => sum + amount, 0);
  if (!paid) return [{ method: "split", amount: total / 100 }];
  const magnitude = Math.abs(total);
  const shares = tenders.map(([method, amount]) => {
    const exact = magnitude * amount / paid;
    return { method, units: Math.floor(exact), remainder: exact % 1 };
  });
  let remaining = magnitude - shares.reduce((sum, share) => sum + share.units, 0);
  for (const share of [...shares].sort((a, b) => b.remainder - a.remainder)) {
    if (remaining-- > 0) share.units += 1;
  }
  return shares.map(({ method, units }) => ({ method, amount: Math.sign(total) * units / 100 }));
}

async function withPayments(sales) {
  const numbers = [...new Set(sales.filter((sale) => sale.paymentMethod === "split").map((sale) => sale.receiptNo).filter(Boolean))];
  const receipts = numbers.length
    ? await Receipt.find({ receiptNo: { $in: numbers } }).select("receiptNo payments changeDue").lean()
    : [];
  const byNumber = new Map(receipts.map((receipt) => [receipt.receiptNo, receipt]));
  // Round cumulative shares, then take the difference for each product. This
  // keeps a whole receipt exact to the cent, including a product-only search.
  const allocations = new Map();
  if (numbers.length) {
    const Sale = require("../models/Salesmodel");
    const lines = await Sale.find({ receiptNo: { $in: numbers }, paymentMethod: "split" })
      .select("receiptNo totalAmount paymentMethod source").sort({ _id: 1 }).lean();
    const running = new Map();
    for (const line of lines) {
      const key = `${line.receiptNo}:${line.source === "refund" ? "refund" : "sale"}`;
      const before = running.get(key) || 0;
      const after = before + cents(line.totalAmount);
      const receipt = byNumber.get(line.receiptNo);
      const previous = new Map(allocatePayments({ ...line, totalAmount: before / 100 }, receipt).map((p) => [p.method, cents(p.amount)]));
      allocations.set(String(line._id), allocatePayments({ ...line, totalAmount: after / 100 }, receipt).map((p) => ({
        method: p.method, amount: (cents(p.amount) - (previous.get(p.method) || 0)) / 100,
      })));
      running.set(key, after);
    }
  }
  return sales.map((sale) => {
    const row = typeof sale.toObject === "function" ? sale.toObject() : sale;
    return { ...row, paymentBreakdown: allocations.get(String(row._id)) || allocatePayments(row, byNumber.get(row.receiptNo)) };
  });
}

module.exports = { allocatePayments, withPayments };
