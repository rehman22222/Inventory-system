const { formatDateTime, money } = require("./csv");

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const fail = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

const boolParam = (value) =>
  value === true || value === "true" || value === "1" || value === 1;

const periodLabel = (from, to) => {
  if (from && to) return `${from} to ${to}`;
  if (from) return `from ${from}`;
  if (to) return `up to ${to}`;
  return "All time";
};

const refundTotal = (receipt) =>
  roundMoney(
    (receipt.refunds || []).reduce(
      (sum, entry) => sum + Number(entry.amount || 0),
      0
    )
  );

const receiptNetAfterRefunds = (receipt) => {
  if (receipt.status === "voided") return 0;
  return roundMoney(Math.max(0, Number(receipt.total || 0) - refundTotal(receipt)));
};

const normaliseTarget = (query = {}, currentNet) => {
  const rawTarget = query.targetTotal;
  const hasTarget =
    rawTarget !== undefined && rawTarget !== null && String(rawTarget).trim() !== "";

  if (!hasTarget) {
    throw fail("New net sales total is required");
  }

  const targetTotal = roundMoney(rawTarget);

  if (!Number.isFinite(targetTotal) || targetTotal < 0) {
    throw fail("New net sales total must be zero or more");
  }

  if (currentNet <= 0 && targetTotal > 0) {
    throw fail("No positive receipts found to distribute the new total across");
  }

  return targetTotal;
};

const normaliseOptionalTax = (query = {}) => {
  const applyTax = boolParam(query.applyTax);
  const taxRate = Number(query.taxRate || 0);

  if (!applyTax) return { applyTax: false, taxRate: 0 };

  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    throw fail("Tax rate must be between 0 and 100");
  }

  return { applyTax: true, taxRate };
};

const isCashReceipt = (receipt = {}) =>
  String(receipt.paymentMethod || "").toLowerCase() === "cash";

const allocateTotals = (metrics, targetGrandTotal) => {
  const lockedTotal = roundMoney(
    metrics.reduce(
      (sum, entry) => sum + (entry.adjustable ? 0 : entry.currentNet),
      0
    )
  );
  const currentCashTotal = roundMoney(
    metrics.reduce(
      (sum, entry) => sum + (entry.adjustable ? entry.currentNet : 0),
      0
    )
  );
  const targetCashTotal = roundMoney(targetGrandTotal - lockedTotal);

  if (targetCashTotal < 0) {
    throw fail(
      "New net sales total is lower than the card/split total. Card and split receipts stay unchanged, so only cash can be adjusted."
    );
  }

  if (currentCashTotal <= 0) {
    if (targetCashTotal > 0) {
      throw fail("No positive cash receipts found to distribute the new total across");
    }

    return metrics.map((entry) => ({
      ...entry,
      adjustedNet: entry.adjustable ? 0 : entry.currentNet,
    }));
  }

  let remaining = roundMoney(targetCashTotal);
  const positiveCashIndexes = metrics
    .map((entry, index) => (entry.adjustable && entry.currentNet > 0 ? index : null))
    .filter((index) => index !== null);
  const lastPositiveCash = positiveCashIndexes[positiveCashIndexes.length - 1];

  return metrics.map((entry, index) => {
    if (!entry.adjustable) return { ...entry, adjustedNet: entry.currentNet };
    if (entry.currentNet <= 0) return { ...entry, adjustedNet: 0 };

    const adjustedNet =
      index === lastPositiveCash
        ? roundMoney(remaining)
        : roundMoney((entry.currentNet / currentCashTotal) * targetCashTotal);

    remaining = roundMoney(remaining - adjustedNet);
    return { ...entry, adjustedNet };
  });
};

const itemSummary = (receipt) =>
  (receipt.items || [])
    .map((item) => `${item.quantity}x ${item.name || "Item"}`)
    .join(", ");

const currentNetTotal = (receipts = []) =>
  roundMoney(
    receipts.reduce((sum, receipt) => sum + receiptNetAfterRefunds(receipt), 0)
  );

const buildShadowNetReport = (receipts, query = {}) => {
  const sourceReceipts = Array.isArray(receipts) ? receipts : [];
  const tax = normaliseOptionalTax(query);
  const metrics = sourceReceipts.map((receipt, index) => ({
    index,
    adjustable: isCashReceipt(receipt),
    refunded: refundTotal(receipt),
    currentNet: receiptNetAfterRefunds(receipt),
  }));

  const currentNet = roundMoney(
    metrics.reduce((sum, entry) => sum + entry.currentNet, 0)
  );
  const targetTotal = normaliseTarget(query, currentNet);
  const allocated = allocateTotals(metrics, targetTotal);

  let adjustedTotal = 0;
  let taxTotal = 0;
  let adjustedWithTaxTotal = 0;

  const baseHeaders = [
    "Receipt No",
    "Date & Time",
    "Cashier",
    "Status",
    "Payment",
    "Items",
    "Price",
  ];
  const headers = tax.applyTax
    ? [...baseHeaders, "Tax Rate", "Tax", "Price + Tax"]
    : baseHeaders;

  const rows = allocated.map((entry) => {
    const receipt = sourceReceipts[entry.index];
    const rowTax = tax.applyTax ? roundMoney(entry.adjustedNet * (tax.taxRate / 100)) : 0;
    const rowWithTax = roundMoney(entry.adjustedNet + rowTax);

    adjustedTotal += entry.adjustedNet;
    taxTotal += rowTax;
    adjustedWithTaxTotal += rowWithTax;

    const row = [
      receipt.receiptNo || "",
      formatDateTime(receipt.createdAt),
      receipt.cashierName || "",
      receipt.status || "",
      receipt.paymentMethod || "",
      itemSummary(receipt),
      money(entry.adjustedNet),
    ];

    if (tax.applyTax) {
      row.push(`${money(tax.taxRate)}%`, money(rowTax), money(rowWithTax));
    }

    return row;
  });

  const summary = [
    ["Period", periodLabel(query.from, query.to)],
    ["Receipts Included", sourceReceipts.length],
    ["Net Sales", money(adjustedTotal)],
  ];

  if (tax.applyTax) {
    summary.push(
      ["Tax Rate", `${money(tax.taxRate)}%`],
      ["Tax", money(taxTotal)],
      ["Net Sales + Tax", money(adjustedWithTaxTotal)]
    );
  }

  return {
    title: "Net Sales Report",
    subtitle: `Period: ${periodLabel(query.from, query.to)}`,
    headers,
    rows,
    summary,
  };
};

module.exports = { buildShadowNetReport, currentNetTotal };
