// Small dependency-free CSV builder with proper escaping and date formatting.

const pad = (n) => String(n).padStart(2, "0");

const formatDate = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatDateTime = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const money = (value) => {
  const n = Number(value || 0);
  return n.toFixed(2);
};

const escapeCell = (value) => {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toRow = (cells) => cells.map(escapeCell).join(",");

/**
 * Build a flat, import-safe CSV data set. CSV cannot preserve colours, widths,
 * formulas, frozen panes or print layout; the Excel export is the polished
 * human-facing report. Starting with the header also keeps imports predictable.
 */
const buildCsv = ({ headers, rows }) => {
  const lines = [toRow(headers)];
  rows.forEach((r) => lines.push(toRow(r)));

  // Prepend BOM so Excel opens UTF-8 correctly.
  return "﻿" + lines.join("\r\n");
};

module.exports = { buildCsv, formatDate, formatDateTime, money };
