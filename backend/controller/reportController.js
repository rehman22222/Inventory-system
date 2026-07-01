const Sale = require("../models/Salesmodel");
const Product = require("../models/Productmodel");
const User = require("../models/Usermodel");
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
const { buildCsv, formatDate, formatDateTime, money } = require("../libs/csv");

const LOW_STOCK_THRESHOLD = 10;

// Build an inclusive createdAt filter from ?from=YYYY-MM-DD&to=YYYY-MM-DD
function dateFilter(from, to) {
  if (!from && !to) return null;
  const range = {};
  if (from) range.$gte = new Date(`${from}T00:00:00`);
  if (to) range.$lte = new Date(`${to}T23:59:59.999`);
  return range;
}

function periodLabel(from, to) {
  if (from && to) return `Period: ${from} to ${to}`;
  if (from) return `Period: from ${from}`;
  if (to) return `Period: up to ${to}`;
  return "Period: All time";
}

// ── Sales: the core profit/loss report ──────────────────────────────────────
async function buildSales(req) {
  const { from, to } = req.query;
  const filter = {};
  if (req.user.role === "staff") filter.cashier = req.user._id;
  const range = dateFilter(from, to);
  if (range) filter.createdAt = range;

  const sales = await Sale.find(filter)
    .populate("products.product", "name costPrice")
    .sort({ createdAt: -1 });

  let grossSales = 0;
  let totalDiscount = 0;
  let totalTax = 0;
  let netRevenue = 0;
  let totalCost = 0;

  const rows = sales.map((s) => {
    const qty = Number(s.products?.quantity || 0);
    const unitPrice = Number(s.products?.price || 0);
    const unitCost = Number(s.products?.product?.costPrice || 0);
    const lineTotal = unitPrice * qty;
    const lineCost = unitCost * qty;
    const lineProfit = lineTotal - lineCost;

    grossSales += lineTotal;
    totalDiscount += Number(s.discount || 0);
    totalTax += Number(s.tax || 0);
    netRevenue += Number(s.totalAmount || 0);
    totalCost += lineCost;

    return [
      s.receiptNo || "",
      formatDateTime(s.createdAt),
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
      s.source,
    ];
  });

  const grossProfit = grossSales - totalCost;
  const netProfit = netRevenue - totalCost;

  return {
    title: req.user.role === "staff" ? "My Sales Report" : "Sales Report",
    subtitle: periodLabel(from, to),
    headers: [
      "Receipt No", "Date & Time", "Customer", "Cashier", "Product",
      "Qty", "Unit Price", "Unit Cost", "Line Total", "Line Profit",
      "Total", "Payment", "Status", "Source",
    ],
    rows,
    summary: [
      ["Total Transactions", sales.length],
      ["Gross Sales", money(grossSales)],
      ["Total Discount", money(totalDiscount)],
      ["Total Tax", money(totalTax)],
      ["Net Revenue", money(netRevenue)],
      ["Total Cost of Goods", money(totalCost)],
      ["Gross Profit", money(grossProfit)],
      ["Net Profit / Loss", money(netProfit)],
    ],
  };
}

// ── Inventory: stock valuation + potential profit ───────────────────────────
async function buildInventory() {
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
      formatDate(p.expiryDate),
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
  const { from, to } = req.query;
  const filter = {};
  const range = dateFilter(from, to);
  if (range) filter.createdAt = range;

  const logs = await ActivityLog.find(filter)
    .populate("userId", "name email")
    .sort({ createdAt: -1 })
    .limit(2000);

  return {
    title: "Activity Log Report",
    subtitle: periodLabel(from, to),
    headers: ["Date & Time", "User", "Email", "Action", "Entity", "Description", "IP Address"],
    rows: logs.map((l) => [
      formatDateTime(l.createdAt),
      l.userId?.name || "",
      l.userId?.email || "",
      l.action,
      l.entity,
      l.description,
      l.ipAddress || "",
    ]),
  };
}

// ── Registry: single source of truth for labels + role access ───────────────
const REPORTS = {
  sales: { label: "Sales", roles: ["admin", "manager", "staff"], build: buildSales },
  inventory: { label: "Inventory & Valuation", roles: ["admin", "manager"], build: buildInventory },
  activity: { label: "Activity Log", roles: ["admin"], build: buildActivity },
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

    const report = await def.build(req);
    const csv = buildCsv({
      title: report.title,
      subtitle: report.subtitle,
      generatedBy: `${req.user.name || "User"} (${req.user.role})`,
      headers: report.headers,
      rows: report.rows,
      summary: report.summary,
    });

    const filename = `${type}-report-${formatDate(new Date())}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (error) {
    console.error("Report generation failed:", error);
    return res.status(500).json({ message: "Failed to generate report", error: error.message });
  }
};
