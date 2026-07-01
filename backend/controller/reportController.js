const Sale = require("../models/Salesmodel");
const Product = require("../models/Productmodel");
const Order = require("../models/Ordermodel");
const Supplier = require("../models/Suppliermodel");
const StockTransaction = require("../models/StockTranscationmodel");
const User = require("../models/Usermodel");
const ActivityLog = require("../models/ActivityLogmodel");
// Ensure the Category schema is registered for populate(), regardless of load
// order. (The model file has a leading space in its name in this project.)
try {
  require("../models/Categorymodel");
} catch (e) {
  require("../models/ Categorymodel");
}
const { buildCsv, formatDate, formatDateTime, money } = require("../libs/csv");

const LOW_STOCK_THRESHOLD = 10;

// ── Report builders. Each returns { title, headers, rows } ──────────────────

async function buildSales(req) {
  const filter = {};
  // Staff only ever see their own sales.
  if (req.user.role === "staff") filter.cashier = req.user._id;

  const sales = await Sale.find(filter)
    .populate("products.product", "name")
    .sort({ createdAt: -1 });

  return {
    title: req.user.role === "staff" ? "My Sales Report" : "Sales Report",
    headers: [
      "Receipt No", "Date & Time", "Customer", "Cashier", "Product",
      "Qty", "Unit Price", "Discount", "Tax", "Total", "Payment", "Status", "Source",
    ],
    rows: sales.map((s) => [
      s.receiptNo || "",
      formatDateTime(s.createdAt),
      s.customerName,
      s.cashierName || "",
      s.products?.product?.name || "",
      s.products?.quantity ?? "",
      money(s.products?.price),
      money(s.discount),
      money(s.tax),
      money(s.totalAmount),
      s.paymentMethod,
      s.status,
      s.source,
    ]),
  };
}

async function buildInventory() {
  const products = await Product.find({})
    .populate("Category", "name")
    .populate("supplier", "name")
    .sort({ name: 1 });

  return {
    title: "Inventory & Stock Valuation Report",
    headers: [
      "Name", "Category", "Barcode", "Quantity", "Unit Price",
      "Stock Value", "Expiry Date", "Supplier", "Created",
    ],
    rows: products.map((p) => [
      p.name,
      p.Category?.name || "Uncategorized",
      p.barcode || "",
      p.quantity ?? 0,
      money(p.Price),
      money(Number(p.Price || 0) * Number(p.quantity || 0)),
      formatDate(p.expiryDate),
      p.supplier?.name || "",
      formatDate(p.createdAt),
    ]),
  };
}

async function buildLowStock() {
  const products = await Product.find({ quantity: { $lte: LOW_STOCK_THRESHOLD } })
    .populate("Category", "name")
    .sort({ quantity: 1 });

  return {
    title: `Low Stock Report (<= ${LOW_STOCK_THRESHOLD} units)`,
    headers: ["Name", "Category", "Barcode", "Quantity", "Unit Price", "Status"],
    rows: products.map((p) => [
      p.name,
      p.Category?.name || "Uncategorized",
      p.barcode || "",
      p.quantity ?? 0,
      money(p.Price),
      Number(p.quantity) <= 0 ? "Out of stock" : "Low",
    ]),
  };
}

async function buildOrders() {
  const orders = await Order.find({})
    .populate("user", "name")
    .populate("Product.product", "name")
    .sort({ createdAt: -1 });

  return {
    title: "Orders Report",
    headers: [
      "Order ID", "Date & Time", "Description", "Product", "Qty",
      "Unit Price", "Total", "Status", "Ordered By",
    ],
    rows: orders.map((o) => [
      o._id.toString(),
      formatDateTime(o.createdAt),
      o.Description,
      o.Product?.product?.name || "",
      o.Product?.quantity ?? "",
      money(o.Product?.price),
      money(o.totalAmount),
      o.status || "",
      o.user?.name || "",
    ]),
  };
}

async function buildSuppliers() {
  const suppliers = await Supplier.find({})
    .populate("productsSupplied", "name")
    .sort({ name: 1 });

  return {
    title: "Suppliers Report",
    headers: ["Name", "Phone", "Email", "Address", "Product Supplied", "Created"],
    rows: suppliers.map((s) => [
      s.name || "",
      s.contactInfo?.phone || "",
      s.contactInfo?.email || "",
      s.contactInfo?.address || "",
      s.productsSupplied?.name || "",
      formatDate(s.createdAt),
    ]),
  };
}

async function buildStockTransactions() {
  const txns = await StockTransaction.find({})
    .populate("product", "name")
    .populate("supplier", "name")
    .sort({ createdAt: -1 });

  return {
    title: "Stock Transactions Report",
    headers: ["Date & Time", "Type", "Product", "Quantity", "Supplier", "Reference"],
    rows: txns.map((t) => [
      formatDateTime(t.transactionDate || t.createdAt),
      t.type,
      t.product?.name || "",
      t.quantity ?? "",
      t.supplier?.name || "",
      t.reference || "",
    ]),
  };
}

async function buildUsers() {
  const users = await User.find({}).select("-password").sort({ createdAt: -1 });
  return {
    title: "Users Report",
    headers: ["Name", "Email", "Role", "Joined"],
    rows: users.map((u) => [u.name, u.email, u.role, formatDateTime(u.createdAt)]),
  };
}

async function buildActivity() {
  const logs = await ActivityLog.find({})
    .populate("userId", "name email")
    .sort({ createdAt: -1 })
    .limit(2000);

  return {
    title: "Activity Log Report",
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

// ── Report registry: single source of truth for labels + role access ────────

const REPORTS = {
  sales: { label: "Sales", roles: ["admin", "manager", "staff"], build: buildSales },
  "low-stock": { label: "Low Stock", roles: ["admin", "manager", "staff"], build: buildLowStock },
  inventory: { label: "Inventory & Valuation", roles: ["admin", "manager"], build: buildInventory },
  orders: { label: "Orders", roles: ["admin", "manager"], build: buildOrders },
  suppliers: { label: "Suppliers", roles: ["admin", "manager"], build: buildSuppliers },
  "stock-transactions": { label: "Stock Transactions", roles: ["admin", "manager"], build: buildStockTransactions },
  users: { label: "Users", roles: ["admin"], build: buildUsers },
  activity: { label: "Activity Log", roles: ["admin"], build: buildActivity },
};

// GET /api/reports — list reports available to the current role.
module.exports.listReports = (req, res) => {
  const role = req.user.role;
  const available = Object.entries(REPORTS)
    .filter(([, def]) => def.roles.includes(role))
    .map(([key, def]) => ({ key, label: def.label }));
  res.status(200).json({ reports: available });
};

// GET /api/reports/:type — download a role-permitted report as CSV.
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

    const { title, headers, rows } = await def.build(req);
    const csv = buildCsv({
      title,
      generatedBy: `${req.user.name || "User"} (${req.user.role})`,
      headers,
      rows,
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
