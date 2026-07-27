const mongoose = require("mongoose");
const Sale = require("../models/Salesmodel");
const Receipt = require("../models/Receiptmodel");
const Product = require("../models/Productmodel");
const User = require("../models/Usermodel");
const DayClosing = require("../models/DayClosingmodel");
const Store = require("../models/Storemodel");
const ActivityLog = require("../models/ActivityLogmodel");
// Registered so inventory populate("supplier") works regardless of load order.
require("../models/Suppliermodel");
// Ensure the Category schema is registered for populate(), regardless of load
// order. (The model file has a leading space in its name in this project.)
try {
  require("../models/Categorymodel");
} catch (e) {
  require("../models/ Categorymodel");
}
const { buildCsv, money } = require("../libs/csv");
const { buildWorkbookBuffer } = require("../libs/excel");
const { buildPdfBuffer } = require("../libs/pdf");
const { buildShadowNetReport, currentNetTotal } = require("../libs/shadowNetReport");
const { startOfDay, endOfDay, formatInZone } = require("../libs/time");

// Every timestamp on a report is rendered in the shop's timezone, and every
// date-range filter is interpreted there — so a report reads correctly whether
// the shop is in Dublin or Karachi. The zone rides on the request; `downloadReport`
// puts it there before any builder runs.
const zoneOf = (req) => req.reportTz || "UTC";
const fmtDateTime = (value, req) => formatInZone(value, zoneOf(req), true);
const fmtDate = (value, req) => formatInZone(value, zoneOf(req), false);

// One report, three shapes. Excel stays the default so existing links keep
// working; the UI offers PDF and CSV.
const FORMATS = {
  csv: {
    extension: "csv",
    contentType: "text/csv; charset=utf-8",
    build: async (report) => Buffer.from(buildCsv(report), "utf8"),
  },
  pdf: {
    extension: "pdf",
    contentType: "application/pdf",
    build: (report) => buildPdfBuffer(report),
  },
  xlsx: {
    extension: "xlsx",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    build: async (report) => Buffer.from(await buildWorkbookBuffer(report)),
  },
};

const LOW_STOCK_THRESHOLD = 10;

// Build an inclusive createdAt filter from ?from=YYYY-MM-DD&to=YYYY-MM-DD,
// where the day boundaries are the shop's local midnight — not the server's.
function dateFilter(from, to, tz = "UTC") {
  if (!from && !to) return null;
  const range = {};
  if (from) range.$gte = startOfDay(from, tz);
  if (to) range.$lte = endOfDay(to, tz);
  return range;
}

function periodLabel(from, to) {
  if (from && to) return `Period: ${from} to ${to}`;
  if (from) return `Period: from ${from}`;
  if (to) return `Period: up to ${to}`;
  return "Period: All time";
}

function ghostReceiptFilter(query, tz = "UTC") {
  const filter = {};

  if (query.cashier) {
    if (!mongoose.isValidObjectId(query.cashier)) {
      throw Object.assign(new Error("Invalid cashier id"), { statusCode: 400 });
    }
    filter.cashier = new mongoose.Types.ObjectId(query.cashier);
  }

  const range = dateFilter(query.from, query.to, tz);
  if (range) filter.createdAt = range;
  if (query.status) filter.status = query.status;

  return filter;
}

// ── Sales: the core profit/loss report ──────────────────────────────────────
async function buildSales(req, options = {}) {
  const { from, to } = req.query;
  const filter = {};
  if (req.user.role === "staff") filter.cashier = req.user._id;
  const range = dateFilter(from, to, zoneOf(req));
  if (range) filter.createdAt = range;
  // Channel scope: "online" = web orders only; "pos" = everything except online
  // (counter sales + refunds); default = combined (no source filter).
  if (options.source === "online") filter.source = "online";
  else if (options.source === "pos") filter.source = { $ne: "online" };

  const sales = await Sale.find(filter)
    .populate("products.product", "name costPrice")
    .sort({ createdAt: -1 });

  let grossSales = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  let netRevenue = 0;
  let totalCost = 0;
  const byChannel = {
    counter: { receipts: new Set(), revenue: 0 },
    online: { receipts: new Set(), revenue: 0 },
    refunds: { receipts: new Set(), revenue: 0 },
  };
  const allReceipts = new Set();

  const rows = sales.map((s) => {
    // Refund rows reverse an earlier sale: the goods came back, so their value
    // AND their cost must be subtracted, not added.
    const sign = s.source === "refund" ? -1 : 1;

    const qty = sign * Number(s.products?.quantity || 0);
    const unitPrice = Number(s.products?.price || 0);
    const unitCost = Number(s.products?.product?.costPrice || 0);
    const lineTotal = unitPrice * qty;
    const lineCost = unitCost * qty;
    const lineProfit = lineTotal - lineCost;

    grossSales += lineTotal;
    totalDiscount += sign * Number(s.discount || 0);
    totalTax += sign * Number(s.tax || 0);
    netRevenue += Number(s.totalAmount || 0); // already signed
    totalCost += lineCost;
    const channel =
      s.source === "online"
        ? "Online store"
        : s.source === "refund"
          ? "Refund"
          : "POS / counter";
    const bucket =
      s.source === "online"
        ? byChannel.online
        : s.source === "refund"
          ? byChannel.refunds
          : byChannel.counter;
    const receiptKey = s.receiptNo || String(s._id);
    bucket.receipts.add(receiptKey);
    allReceipts.add(receiptKey);
    bucket.revenue += Number(s.totalAmount || 0);

    return [
      s.receiptNo || "",
      fmtDateTime(s.createdAt, req),
      s.customerName,
      s.cashierName || "",
      s.products?.product?.name || "",
      qty,
      money(unitPrice),
      money(unitCost),
      money(lineTotal),
      money(lineProfit),
      money(s.totalAmount),
      s.paymentMethod,
      s.status,
      channel,
    ];
  });

  const grossProfit = grossSales - totalCost;
  const netProfit = netRevenue - totalCost;
  const summary = [
    ["Total Receipts / Orders", allReceipts.size],
    ["Total Sale Lines", sales.length],
    ["Gross Sales", money(grossSales)],
    ["Total Discount", money(totalDiscount)],
    ["Total Tax", money(totalTax)],
    ["Net Revenue", money(netRevenue)],
    ["Total Cost of Goods", money(totalCost)],
    ["Gross Profit", money(grossProfit)],
    ["Net Profit / Loss", money(netProfit)],
  ];

  if (options.combined) {
    summary.unshift(
      ["POS / Counter Receipts", byChannel.counter.receipts.size],
      ["POS / Counter Revenue", money(byChannel.counter.revenue)],
      ["Online Orders", byChannel.online.receipts.size],
      ["Online Revenue", money(byChannel.online.revenue)],
      ["Refund Receipts", byChannel.refunds.receipts.size],
      ["Refund Value", money(byChannel.refunds.revenue)],
    );
  }

  return {
    title: options.combined
      ? "POS + Online Combined Sales Report"
      : req.user.role === "staff"
        ? "My Sales Report"
        : "Sales Report",
    subtitle: periodLabel(from, to),
    headers: [
      "Receipt No", "Date & Time", "Customer", "Cashier", "Product",
      "Qty", "Unit Price", "Unit Cost", "Line Total", "Line Profit",
      "Total", "Payment", "Status", "Channel",
    ],
    rows,
    summary,
  };
}

async function buildCombinedSales(req) {
  return buildSales(req, { combined: true });
}

// Channel-scoped variants of the sales report.
async function buildPosSales(req) {
  return buildSales(req, { source: "pos" });
}
async function buildOnlineSales(req) {
  return buildSales(req, { source: "online" });
}

// ── Inventory: stock valuation + potential profit ───────────────────────────
async function buildInventory(req) {
  const products = await Product.find({})
    .populate("Category", "name")
    .populate("supplier", "name")
    .sort({ name: 1 });

  let totalUnits = 0;
  let totalCostValue = 0;
  let totalRetailValue = 0;

  const rows = products.map((p) => {
    const qty = Number(p.quantity || 0);
    const price = Number(p.Price || 0);
    const cost = Number(p.costPrice || 0);
    totalUnits += qty;
    totalCostValue += cost * qty;
    totalRetailValue += price * qty;

    return [
      p.name,
      p.Category?.name || "Uncategorized",
      p.barcode || "",
      qty,
      money(cost),
      money(price),
      money(price * qty),
      qty <= 0 ? "Out of stock" : qty <= LOW_STOCK_THRESHOLD ? "Low" : "OK",
      p.expiryDate ? fmtDate(p.expiryDate, req) : "",
      p.supplier?.name || "",
    ];
  });

  return {
    title: "Inventory & Stock Valuation Report",
    headers: [
      "Name", "Category", "Barcode", "Quantity", "Unit Cost",
      "Unit Price", "Retail Value", "Stock Status", "Expiry Date", "Supplier",
    ],
    rows,
    summary: [
      ["Total Products", products.length],
      ["Total Units in Stock", totalUnits],
      ["Total Cost Value", money(totalCostValue)],
      ["Total Retail Value", money(totalRetailValue)],
      ["Potential Profit", money(totalRetailValue - totalCostValue)],
    ],
  };
}

// ── Activity log: audit trail for admins ────────────────────────────────────
async function buildActivity(req) {
  const filter = {};
  let from = req.query.from;
  let to = req.query.to;

  // An admin's report is bounded by exactly the window they were granted — the
  // same slice they see on screen. A superadmin may narrow with query dates but
  // is not bounded. This is the hard limit, so the download can't reach past the
  // grant.
  if (req.user.role !== "superadmin") {
    const gFrom = req.user.logAccessFrom;
    const gTo = req.user.logAccessTo;
    if (gFrom || gTo) {
      filter.createdAt = {};
      if (gFrom) filter.createdAt.$gte = new Date(gFrom);
      if (gTo) filter.createdAt.$lte = new Date(gTo);
    }
    from = gFrom ? fmtDate(gFrom, req) : from;
    to = gTo ? fmtDate(gTo, req) : to;
  } else {
    const range = dateFilter(from, to, zoneOf(req));
    if (range) filter.createdAt = range;
  }

  const logs = await ActivityLog.find(filter)
    .populate("userId", "name email")
    .sort({ createdAt: -1 })
    .limit(5000);

  return {
    title: "Activity Log Report",
    subtitle: periodLabel(from, to),
    headers: ["Date & Time", "User", "Email", "Action", "Entity", "Description", "IP Address"],
    rows: logs.map((l) => [
      fmtDateTime(l.createdAt, req),
      l.userId?.name || "",
      l.userId?.email || "",
      l.action,
      l.entity,
      l.description,
      l.ipAddress || "",
    ]),
  };
}

// ── Day closing: what one cashier handed over ───────────────────────────────
async function buildDayClosing(req) {
  const { id } = req.query;

  if (!mongoose.isValidObjectId(id)) {
    throw Object.assign(new Error("A valid day closing id is required"), { statusCode: 400 });
  }

  const closing = await DayClosing.findById(id).populate({
    path: "receipts",
    select: "receiptNo customerName total status createdAt items paymentMethod",
  });

  if (!closing) {
    throw Object.assign(new Error("Day closing not found"), { statusCode: 404 });
  }

  // One row per line sold, not per receipt — the point of the report is to show
  // the admin what the money was actually made of.
  const rows = [];
  (closing.receipts || []).forEach((receipt) => {
    (receipt.items || []).forEach((item) => {
      rows.push([
        receipt.receiptNo,
        fmtDateTime(receipt.createdAt, req),
        receipt.customerName || "",
        item.name || "",
        item.quantity,
        money(item.price),
        money(item.lineTotal),
        receipt.paymentMethod || "",
        receipt.status || "",
      ]);
    });
  });

  const summary = [
    ["Reference", closing.reference],
    ["Cashier", `${closing.cashierName || ""} (${closing.cashierRole || ""})`],
    ["Opened", fmtDateTime(closing.openedAt, req)],
    ["Closed", fmtDateTime(closing.closedAt, req)],
    ["Sales", closing.receiptCount],
    ["Gross", money(closing.gross)],
    ["Discounts", money(closing.discount)],
    ["Tax", money(closing.tax)],
    ["Refunded", money(closing.refunded)],
    ["Net handed over", money(closing.net)],
  ];

  // The drawer/terminal split — the figure the admin actually reconciles against.
  (closing.byMethod || []).forEach((entry) => {
    summary.push([`  ${entry.method}`, `${money(entry.amount)} (${entry.count})`]);
  });

  return {
    title: `Day Closing ${closing.reference}`,
    subtitle: `${closing.cashierName} · closed ${fmtDateTime(closing.closedAt, req)}`,
    headers: [
      "Receipt No", "Date & Time", "Customer", "Product",
      "Qty", "Unit Price", "Line Total", "Payment", "Status",
    ],
    rows,
    summary,
  };
}

// ── Registry: single source of truth for labels + role access ───────────────
async function buildGhostNet(req) {
  const filter = ghostReceiptFilter(req.query, zoneOf(req));
  const receipts = await Receipt.find(filter)
    .select("receiptNo createdAt cashierName status paymentMethod total refunds.amount items.quantity items.name")
    .sort({ createdAt: -1 })
    .maxTimeMS(120000)
    .lean();
  return buildShadowNetReport(receipts, req.query);
}

module.exports.previewGhostNet = async (req, res) => {
  try {
    const shop = await Store.findOne({ key: "shop" }).select("timezone").lean();
    req.reportTz = shop?.timezone || "UTC";
    const filter = ghostReceiptFilter(req.query, zoneOf(req));
    const receipts = await Receipt.find(filter)
      .select("total status refunds.amount")
      .maxTimeMS(120000)
      .lean();

    return res.status(200).json({
      period: periodLabel(req.query.from, req.query.to),
      receipts: receipts.length,
      existingNet: currentNetTotal(receipts),
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? "Could not calculate existing net sales" : error.message,
      error: error.message,
    });
  }
};

const REPORTS = {
  // Financial takings report — owner/admin only. A manager oversees closings but
  // does not pull the shop's sales/profit report.
  sales: { label: "Sales", roles: ["superadmin", "admin"], build: buildSales },
  "combined-sales": {
    label: "POS + Online Combined Sales",
    roles: ["superadmin", "admin"],
    build: buildCombinedSales,
  },
  "pos-sales": {
    label: "POS Sales",
    roles: ["superadmin", "admin"],
    build: buildPosSales,
  },
  "online-sales": {
    label: "Online Sales",
    roles: ["superadmin", "admin"],
    build: buildOnlineSales,
  },
  inventory: {
    label: "Inventory & Valuation",
    roles: ["superadmin", "admin", "manager"],
    build: buildInventory,
  },
  // Downloading the audit trail is the same thing as reading it, so it sits
  // behind the same grant — otherwise the report would be a way straight past
  // the gate on /activitylogs/getAllLogs.
  activity: {
    label: "Activity Log",
    roles: ["admin", "superadmin"],
    requiresLogAccess: true,
    build: buildActivity,
  },
  // One batch at a time, keyed by ?id=. Handed-over takings belong to the owner
  // side — the cashier who closed the batch must not be able to pull it back.
  "day-closing": {
    label: "Day Closing",
    roles: ["admin", "superadmin"],
    build: buildDayClosing,
  },
  "ghost-net": {
    label: "Adjusted Net Sales",
    roles: ["superadmin"],
    build: buildGhostNet,
  },
};

module.exports.listReports = (req, res) => {
  const role = req.user.role;
  const available = Object.entries(REPORTS)
    .filter(([, def]) => def.roles.includes(role))
    .map(([key, def]) => ({ key, label: def.label }));
  res.status(200).json({ reports: available });
};

module.exports.downloadReport = async (req, res) => {
  try {
    const { type } = req.params;
    const def = REPORTS[type];

    if (!def) {
      return res.status(404).json({ message: "Unknown report type" });
    }
    if (!def.roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have access to this report" });
    }

    // Some reports need more than a role — the audit trail needs a live grant.
    if (def.requiresLogAccess && req.user.role !== "superadmin") {
      const until = req.user.logAccessUntil;
      if (!until || new Date(until).getTime() <= Date.now()) {
        return res.status(403).json({
          message: until
            ? "Your access to the activity log has expired — request it again"
            : "Ask the super admin for access to the activity log",
          needsApproval: "view_activity_logs",
        });
      }
    }

    const requested = String(req.query.format || "xlsx").toLowerCase();
    const format = FORMATS[requested];

    if (!format) {
      return res.status(400).json({
        message: `Unsupported format "${requested}". Use one of: ${Object.keys(FORMATS).join(", ")}`,
      });
    }

    // The shop's letterhead, currency and timezone. Loaded before the builder
    // runs so every timestamp and date filter inside it can use the shop's zone.
    const shop = await Store.findOne({ key: "shop" }).lean();
    const timezone = shop?.timezone || "UTC";
    req.reportTz = timezone;

    const report = await def.build(req);

    const buffer = await format.build({
      reportType: type,
      title: report.title,
      subtitle: report.subtitle,
      generatedBy: `${req.user.name || "User"} (${req.user.role})`,
      headers: report.headers,
      rows: report.rows,
      summary: report.summary,
      shop: shop || {},
      currency: shop?.currency || "EUR",
      timezone,
    });

    // Name the file after the shop, dated in the shop's own day so a file
    // downloaded just after local midnight isn't stamped the previous day.
    const slug = String(shop?.name || "report")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const filename = `${slug}-${type}-${fmtDate(new Date(), req)}.${format.extension}`;
    res.setHeader("Content-Type", format.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("Report generation failed:", error);
    // A builder can reject for a real reason (unknown id, missing batch). Pass
    // that through rather than flattening everything to an opaque 500.
    const status = error.statusCode || 500;
    return res.status(status).json({
      message: status === 500 ? "Failed to generate report" : error.message,
      error: error.message,
    });
  }
};
