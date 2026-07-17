const { formatDateTime, money } = require("./csv");

const TAX_MODES = ["exclusive", "inclusive"];

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100;

const fail = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });

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

const normaliseTaxParams = (query = {}) => {
  const jurisdiction =
    String(query.jurisdiction || "").trim() || "Custom tax jurisdiction";
  const taxMode = TAX_MODES.includes(query.taxMode) ? query.taxMode : "exclusive";
  const taxRate = Number(query.taxRate || 0);

  if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
    throw fail("Tax rate must be between 0 and 100");
  }

  const rawTarget = query.targetTotal;
  const hasTargetTotal =
    rawTarget !== undefined && rawTarget !== null && String(rawTarget).trim() !== "";
  const targetTotal = hasTargetTotal ? roundMoney(rawTarget) : null;

  if (hasTargetTotal && (!Number.isFinite(targetTotal) || targetTotal < 0)) {
    throw fail("Target total must be zero or more");
  }

  return {
    jurisdiction,
    taxMode,
    taxRate,
    hasTargetTotal,
    targetTotal,
  };
};

const receiptNetAfterRefunds = (receipt) => {
  if (receipt.status === "voided") return 0;
  return roundMoney(Math.max(0, Number(receipt.total || 0) - refundTotal(receipt)));
};

const taxBreakdown = (finalTotal, taxRate) => {
  const rate = Number(taxRate || 0);
  if (rate <= 0) {
    return { taxableBase: roundMoney(finalTotal), tax: 0 };
  }

  const taxableBase = roundMoney(Number(finalTotal || 0) / (1 + rate / 100));
  return {
    taxableBase,
    tax: roundMoney(Number(finalTotal || 0) - taxableBase),
  };
};

const allocateTotals = (metrics, targetGrandTotal) => {
  const sourceGrandTotal = roundMoney(
    metrics.reduce((sum, entry) => sum + entry.sourceNet, 0)
  );

  if (sourceGrandTotal <= 0) {
    if (targetGrandTotal > 0) {
      throw fail("No positive receipts found to distribute the target total across");
    }
    return metrics.map((entry) => ({ ...entry, shadowTotal: 0 }));
  }

  let remaining = roundMoney(targetGrandTotal);
  const positiveIndexes = metrics
    .map((entry, index) => (entry.sourceNet > 0 ? index : null))
    .filter((index) => index !== null);
  const lastPositive = positiveIndexes[positiveIndexes.length - 1];

  return metrics.map((entry, index) => {
    if (entry.sourceNet <= 0) return { ...entry, shadowTotal: 0 };

    const shadowTotal =
      index === lastPositive
        ? roundMoney(remaining)
        : roundMoney((entry.sourceNet / sourceGrandTotal) * targetGrandTotal);

    remaining = roundMoney(remaining - shadowTotal);
    return { ...entry, shadowTotal };
  });
};

const itemSummary = (receipt) =>
  (receipt.items || [])
    .map((item) => `${item.quantity}x ${item.name || "Item"}`)
    .join(", ");

const buildShadowTaxReport = (receipts, query = {}) => {
  const sourceReceipts = Array.isArray(receipts) ? receipts : [];
  const params = normaliseTaxParams(query);

  const metrics = sourceReceipts.map((receipt, index) => ({
    index,
    refunded: refundTotal(receipt),
    sourceNet: receiptNetAfterRefunds(receipt),
  }));

  const originalGrandTotal = roundMoney(
    metrics.reduce((sum, entry) => sum + entry.sourceNet, 0)
  );

  const targetGrandTotal = params.hasTargetTotal
    ? params.targetTotal
    : params.taxMode === "inclusive"
      ? originalGrandTotal
      : roundMoney(originalGrandTotal * (1 + params.taxRate / 100));

  const allocated = allocateTotals(metrics, targetGrandTotal);

  let taxableBaseTotal = 0;
  let taxTotal = 0;
  let shadowGrandTotal = 0;
  let adjustmentTotal = 0;

  const rows = allocated.map((entry) => {
    const receipt = sourceReceipts[entry.index];
    const breakdown = taxBreakdown(entry.shadowTotal, params.taxRate);
    const adjustment = roundMoney(entry.shadowTotal - entry.sourceNet);

    taxableBaseTotal += breakdown.taxableBase;
    taxTotal += breakdown.tax;
    shadowGrandTotal += entry.shadowTotal;
    adjustmentTotal += adjustment;

    return [
      receipt.receiptNo || "",
      formatDateTime(receipt.createdAt),
      receipt.cashierName || "",
      receipt.status || "",
      receipt.paymentMethod || "",
      itemSummary(receipt),
      money(receipt.total),
      money(entry.refunded),
      money(entry.sourceNet),
      params.jurisdiction,
      `${money(params.taxRate)}%`,
      params.taxMode,
      money(breakdown.taxableBase),
      money(breakdown.tax),
      money(entry.shadowTotal),
      money(adjustment),
    ];
  });

  const targetLabel = params.hasTargetTotal
    ? `Forced report total: ${money(params.targetTotal)}`
    : params.taxMode === "inclusive"
      ? "Tax is extracted from current net totals"
      : "Tax is added on top of current net totals";

  return {
    title: "Ghost Tax Shadow Report",
    subtitle: `Period: ${periodLabel(query.from, query.to)}. ${targetLabel}. Original receipts and sales entries are not changed.`,
    headers: [
      "Receipt No",
      "Date & Time",
      "Cashier",
      "Status",
      "Payment",
      "Items",
      "Original Receipt Total",
      "Refunded / Voided",
      "Original Net Used",
      "Tax Jurisdiction",
      "Tax Rate",
      "Tax Mode",
      "Shadow Taxable Base",
      "Shadow Tax",
      "Shadow Report Total",
      "Report-only Adjustment",
    ],
    rows,
    summary: [
      ["Period", periodLabel(query.from, query.to)],
      ["Jurisdiction", params.jurisdiction],
      ["Tax Mode", params.taxMode],
      ["Tax Rate", `${money(params.taxRate)}%`],
      ["Receipts Included", sourceReceipts.length],
      ["Original Net Used", money(originalGrandTotal)],
      ["Shadow Taxable Base", money(taxableBaseTotal)],
      ["Shadow Tax", money(taxTotal)],
      ["Shadow Report Total", money(shadowGrandTotal)],
      ["Report-only Difference", money(adjustmentTotal)],
      ["Algorithm", "O(n) proportional distribution with final-row rounding correction for exact report totals"],
      ["Data Safety", "Report-only calculation; no receipts, sales rows or stock records were changed"],
    ],
  };
};

module.exports = { buildShadowTaxReport };
