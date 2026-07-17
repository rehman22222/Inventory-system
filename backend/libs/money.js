// One place that knows what the shop's money looks like, so a report never
// prints a column of bare numbers and leaves the reader guessing.

const SYMBOLS = {
  EUR: "€",
  GBP: "£",
  USD: "$",
  AED: "د.إ",
  PKR: "₨",
  INR: "₹",
  BDT: "৳",
};

const symbolFor = (code) => SYMBOLS[code] || SYMBOLS.EUR;

// Excel number format. The symbol is quoted so Excel treats it as a literal
// rather than trying to parse it, and negatives get parentheses — the
// convention every accountant reads at a glance.
const excelMoneyFormat = (code) => {
  const s = symbolFor(code);
  return `"${s}"#,##0.00;[Red]("${s}"#,##0.00)`;
};

// For PDF/CSV, where we only have text.
const formatMoney = (value, code) => {
  const n = Number(value || 0);
  const s = symbolFor(code);
  const body = Math.abs(n).toLocaleString("en-IE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-${s}${body}` : `${s}${body}`;
};

module.exports = { SYMBOLS, symbolFor, excelMoneyFormat, formatMoney };
