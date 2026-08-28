const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { applicableDeals } = require("./libs/deals");
const { buildCsv, formatDate } = require("./libs/csv");
const { buildWorkbookBuffer } = require("./libs/excel");
const { buildPdfBuffer } = require("./libs/pdf");
const { buildShadowNetReport, currentNetTotal } = require("./libs/shadowNetReport");

const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "local-store.json");
const storeVersion = 6;

const now = () => new Date().toISOString();
const id = () => crypto.randomBytes(12).toString("hex");

const REPORT_FORMATS = {
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

const CURRENCIES = ["EUR", "GBP", "USD", "AED", "PKR", "INR", "BDT"];

const demoUsers = [
  { _id: "admin-demo", name: "Demo Admin", email: "admin@example.com", password: "Admin@123", role: "admin", ProfilePic: "" },
  { _id: "manager-demo", name: "Demo Manager", email: "manager@example.com", password: "Manager@123", role: "manager", ProfilePic: "" },
  { _id: "staff-demo", name: "Demo Staff", email: "staff@example.com", password: "Staff@123", role: "staff", ProfilePic: "" },
];

function initialStore() {
  const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const categories = [
    { _id: "cat-devices", name: "Devices", description: "Reusable and rechargeable vape devices", createdAt: daysAgo(35), updatedAt: daysAgo(10) },
    { _id: "cat-liquids", name: "E-Liquids", description: "Bottled liquids and flavor refills", createdAt: daysAgo(34), updatedAt: daysAgo(8) },
    { _id: "cat-pods", name: "Pods", description: "Replacement pods and cartridges", createdAt: daysAgo(32), updatedAt: daysAgo(8) },
    { _id: "cat-disposables", name: "Disposables", description: "Single-use inventory items", createdAt: daysAgo(30), updatedAt: daysAgo(5) },
    { _id: "cat-accessories", name: "Accessories", description: "Chargers, cases, coils, and support items", createdAt: daysAgo(28), updatedAt: daysAgo(3) },
  ];
  const suppliers = [
    {
      _id: "sup-northline",
      name: "Northline Distribution",
      contactInfo: { phone: "555-0142", email: "orders@northline.example", address: "1840 Harbor Road, Los Angeles, CA" },
      productsSupplied: ["prod-vaporx"],
      createdAt: daysAgo(29),
      updatedAt: daysAgo(4),
    },
    {
      _id: "sup-cloudnine",
      name: "CloudNine Wholesale",
      contactInfo: { phone: "555-0177", email: "supply@cloudnine.example", address: "72 Market Street, San Diego, CA" },
      productsSupplied: ["prod-mint"],
      createdAt: daysAgo(27),
      updatedAt: daysAgo(6),
    },
    {
      _id: "sup-pacific",
      name: "Pacific Vape Supply",
      contactInfo: { phone: "555-0188", email: "sales@pacificvape.example", address: "404 Commerce Drive, Irvine, CA" },
      productsSupplied: ["prod-pods"],
      createdAt: daysAgo(25),
      updatedAt: daysAgo(2),
    },
  ];
  const products = [
    { _id: "prod-vaporx", barcode: "6291107451234", name: "VaporX Pro Kit", Desciption: "Premium rechargeable starter kit", Category: "cat-devices", Price: 59.99, quantity: 42, supplier: "sup-northline", createdAt: daysAgo(22), updatedAt: daysAgo(2) },
    { _id: "prod-slimpen", barcode: "6291107451235", name: "Slim Pen Device", Desciption: "Compact entry-level rechargeable device", Category: "cat-devices", Price: 34.99, quantity: 18, supplier: "sup-northline", createdAt: daysAgo(21), updatedAt: daysAgo(2) },
    { _id: "prod-mint", barcode: "6291107451236", name: "Arctic Mint 30ml", Desciption: "Cool mint e-liquid bottle", Category: "cat-liquids", Price: 15.99, quantity: 86, supplier: "sup-cloudnine", createdAt: daysAgo(20), updatedAt: daysAgo(1) },
    { _id: "prod-mango", barcode: "6291107451237", name: "Mango Ice 30ml", Desciption: "Fruit blend e-liquid with cool finish", Category: "cat-liquids", Price: 16.99, quantity: 64, supplier: "sup-cloudnine", createdAt: daysAgo(18), updatedAt: daysAgo(1) },
    { _id: "prod-pods", barcode: "6291107451238", name: "Replacement Pod Pack", Desciption: "Three-pack replacement pods", Category: "cat-pods", Price: 12.99, quantity: 31, supplier: "sup-pacific", createdAt: daysAgo(16), updatedAt: daysAgo(3) },
    { _id: "prod-disposable", barcode: "6291107451239", name: "Nova Disposable Blueberry", Desciption: "Single-use blueberry disposable unit", Category: "cat-disposables", Price: 19.99, quantity: 9, supplier: "sup-pacific", createdAt: daysAgo(15), updatedAt: daysAgo(1) },
    { _id: "prod-coils", barcode: "6291107451240", name: "Mesh Coil 5-Pack", Desciption: "Replacement mesh coils", Category: "cat-accessories", Price: 11.49, quantity: 54, supplier: "sup-pacific", createdAt: daysAgo(12), updatedAt: daysAgo(4) },
    { _id: "prod-charger", barcode: "6291107451241", name: "USB-C Fast Charger", Desciption: "Certified USB-C charging cable", Category: "cat-accessories", Price: 8.99, quantity: 73, supplier: "sup-northline", createdAt: daysAgo(10), updatedAt: daysAgo(2) },
  ];
  const orders = [
    { _id: "ord-1001", user: "manager-demo", Description: "Online order for starter kit bundle", Products: [{ product: "prod-vaporx", quantity: 2, price: 59.99 }], totalAmount: 119.98, status: "delivered", createdAt: daysAgo(7), updatedAt: daysAgo(5) },
    { _id: "ord-1002", user: "staff-demo", Description: "Counter pickup for mint refill", Products: [{ product: "prod-mint", quantity: 4, price: 15.99 }], totalAmount: 63.96, status: "shipped", createdAt: daysAgo(5), updatedAt: daysAgo(3) },
    { _id: "ord-1003", user: "manager-demo", Description: "Replacement pods for VIP customer", Products: [{ product: "prod-pods", quantity: 3, price: 12.99 }], totalAmount: 38.97, status: "pending", createdAt: daysAgo(3), updatedAt: daysAgo(3) },
    { _id: "ord-1004", user: "admin-demo", Description: "Accessory reorder for front display", Products: [{ product: "prod-charger", quantity: 5, price: 8.99 }], totalAmount: 44.95, status: "pending", createdAt: daysAgo(1), updatedAt: daysAgo(1) },
  ];
  const sales = [
    { _id: "sale-2001", customerName: "Jordan Lee", products: { product: "prod-vaporx", quantity: 1, price: 59.99 }, totalAmount: 59.99, paymentStatus: "paid", paymentMethod: "creditcard", status: "completed", createdAt: daysAgo(6), updatedAt: daysAgo(6) },
    { _id: "sale-2002", customerName: "Avery Smith", products: { product: "prod-mango", quantity: 3, price: 16.99 }, totalAmount: 50.97, paymentStatus: "paid", paymentMethod: "cash", status: "completed", createdAt: daysAgo(5), updatedAt: daysAgo(5) },
    { _id: "sale-2003", customerName: "Taylor Morgan", products: { product: "prod-pods", quantity: 2, price: 12.99 }, totalAmount: 25.98, paymentStatus: "pending", paymentMethod: "wallet", status: "pending", createdAt: daysAgo(4), updatedAt: daysAgo(3) },
    { _id: "sale-2004", customerName: "Casey Patel", products: { product: "prod-coils", quantity: 4, price: 11.49 }, totalAmount: 45.96, paymentStatus: "paid", paymentMethod: "creditcard", status: "completed", createdAt: daysAgo(2), updatedAt: daysAgo(2) },
    { _id: "sale-2005", customerName: "Riley Chen", products: { product: "prod-disposable", quantity: 2, price: 19.99 }, totalAmount: 39.98, paymentStatus: "paid", paymentMethod: "cash", status: "completed", createdAt: daysAgo(1), updatedAt: daysAgo(1) },
  ];
  const stockTransactions = [
    { _id: "stk-3001", product: "prod-vaporx", type: "Stock-in", quantity: 50, supplier: "sup-northline", transactionDate: daysAgo(12), createdAt: daysAgo(12), updatedAt: daysAgo(12) },
    { _id: "stk-3002", product: "prod-mint", type: "Stock-in", quantity: 120, supplier: "sup-cloudnine", transactionDate: daysAgo(11), createdAt: daysAgo(11), updatedAt: daysAgo(11) },
    { _id: "stk-3003", product: "prod-pods", type: "Stock-in", quantity: 75, supplier: "sup-pacific", transactionDate: daysAgo(9), createdAt: daysAgo(9), updatedAt: daysAgo(9) },
    { _id: "stk-3004", product: "prod-vaporx", type: "Stock-out", quantity: 8, supplier: "sup-northline", transactionDate: daysAgo(6), createdAt: daysAgo(6), updatedAt: daysAgo(6) },
    { _id: "stk-3005", product: "prod-mango", type: "Stock-out", quantity: 14, supplier: "sup-cloudnine", transactionDate: daysAgo(4), createdAt: daysAgo(4), updatedAt: daysAgo(4) },
    { _id: "stk-3006", product: "prod-disposable", type: "Stock-out", quantity: 21, supplier: "sup-pacific", transactionDate: daysAgo(2), createdAt: daysAgo(2), updatedAt: daysAgo(2) },
  ];
  const activityLogs = [
    { _id: "act-4001", action: "Stock Review", description: "Low stock item flagged: Nova Disposable Blueberry.", entity: "product", entityId: "prod-disposable", userId: "manager-demo", ipAddress: "::1", createdAt: daysAgo(1), updatedAt: daysAgo(1) },
    { _id: "act-4002", action: "Create Order", description: "Order ORD-1004 was created for display accessories.", entity: "order", entityId: "ord-1004", userId: "admin-demo", ipAddress: "::1", createdAt: daysAgo(1), updatedAt: daysAgo(1) },
    { _id: "act-4003", action: "Add Product", description: "Product USB-C Fast Charger was added.", entity: "product", entityId: "prod-charger", userId: "manager-demo", ipAddress: "::1", createdAt: daysAgo(2), updatedAt: daysAgo(2) },
    { _id: "act-4004", action: "Sale Completed", description: "Sale completed for Casey Patel.", entity: "order", entityId: "sale-2004", userId: "staff-demo", ipAddress: "::1", createdAt: daysAgo(2), updatedAt: daysAgo(2) },
  ];

  return {
    version: storeVersion,
    users: demoUsers.map((user) => ({ ...user, createdAt: now(), updatedAt: now() })),
    categories,
    products,
    suppliers,
    orders,
    sales,
    stockTransactions,
    notifications: [
      { _id: "not-5001", name: "Low stock alert", type: "Nova Disposable Blueberry is below the reorder threshold.", createdAt: daysAgo(1), updatedAt: daysAgo(1) },
      { _id: "not-5002", name: "New shipment received", type: "CloudNine Wholesale shipment has been logged into stock.", createdAt: daysAgo(3), updatedAt: daysAgo(3) },
      { _id: "not-5003", name: "Demo mode active", type: "MongoDB is skipped. Data is stored in backend/data/local-store.json.", createdAt: daysAgo(4), updatedAt: daysAgo(4) },
    ],
    activityLogs,
    receipts: [],
    vouchers: [],
    deals: [],
    dayClosings: [],
    heldSales: [],
    inventories: products.map((product) => ({
      _id: `inv-${product._id}`,
      product: product._id,
      quantity: product.quantity,
      status: product.quantity === 0 ? "out-of-stock" : product.quantity < 10 ? "low-stock" : "in-stock",
      lastUpdated: product.updatedAt,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    })),
  };
}

function readStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) writeStore(initialStore());
  const store = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  if (store.version !== storeVersion) {
    const seededStore = initialStore();
    writeStore(seededStore);
    return seededStore;
  }
  return store;
}

function writeStore(store) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(store, null, 2));
}

function publicUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return { ...rest, id: user._id };
}

function populateProduct(store, product) {
  if (!product) return product;
  return {
    ...product,
    Category: store.categories.find((category) => category._id === product.Category) || product.Category,
    supplier: store.suppliers.find((supplier) => supplier._id === product.supplier) || product.supplier,
  };
}

function populateOrder(store, order) {
  if (!order) return order;
  // An order is a basket (`Products: [...]`); older single-line demo rows are
  // lifted into the same shape so the page only has to know one.
  const lines = Array.isArray(order.Products)
    ? order.Products
    : order.Product?.product
    ? [order.Product]
    : [];

  return {
    ...order,
    user: publicUser(store.users.find((user) => user._id === order.user)),
    Products: lines.map((line) => ({
      ...line,
      product: populateProduct(
        store,
        store.products.find((product) => product._id === String(line.product))
      ),
    })),
  };
}

function populateSale(store, sale) {
  if (!sale) return sale;
  return {
    ...sale,
    products: {
      ...sale.products,
      product: populateProduct(store, store.products.find((product) => product._id === sale.products?.product)),
    },
  };
}

function populateStockTransaction(store, transaction) {
  if (!transaction) return transaction;
  return {
    ...transaction,
    product: populateProduct(store, store.products.find((product) => product._id === transaction.product)) || transaction.product,
    supplier: store.suppliers.find((supplier) => supplier._id === transaction.supplier) || transaction.supplier,
  };
}

function addActivity(store, action, description, entity, entityId, userId = "manager-demo") {
  const log = {
    _id: id(),
    action,
    description,
    entity,
    entityId,
    userId,
    ipAddress: "::1",
    createdAt: now(),
    updatedAt: now(),
  };
  store.activityLogs.unshift(log);
  return log;
}

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

function voucherDiscountFor(voucher, subtotal) {
  const amount =
    voucher.type === "percent"
      ? (Number(subtotal) * Number(voucher.value)) / 100
      : Number(voucher.value);
  return money(Math.max(0, Math.min(amount, Number(subtotal))));
}

function voucherRejection(voucher, subtotal) {
  if (voucher.status === "disabled") return "This voucher has been disabled";
  if (voucher.status === "used" || Number(voucher.usedCount || 0) >= Number(voucher.usageLimit || 1))
    return "This voucher has already been used";
  if (voucher.expiresAt && new Date(voucher.expiresAt).getTime() < Date.now())
    return "This voucher has expired";
  if (Number(subtotal) < Number(voucher.minSpend || 0))
    return `This voucher needs a minimum spend of ${voucher.minSpend}`;
  return null;
}


function nextReceiptNo(store) {
  const sequence = Number(store.posSequence || 1000) + 1;
  store.posSequence = sequence;
  return `POS-${String(sequence).padStart(6, "0")}`;
}

function nextDayClosingNo(store) {
  const sequence = Number(store.dayClosingSequence || 0) + 1;
  store.dayClosingSequence = sequence;
  return `DC-${String(sequence).padStart(6, "0")}`;
}

// Demo mode has no real session; the client sends the `local-<id>` token the
// demo login handed out, which is enough to tell the cashiers apart.
function currentUser(store, req) {
  const token = (req.headers.authorization || "").replace("Bearer local-", "");
  return store.users.find((user) => user._id === token) || null;
}

const seesAllSales = (user) => user?.role === "admin" || user?.role === "superadmin";

// Mirrors the real controller: a cashier sees their own not-yet-closed takings.
function scopeReceipts(store, req) {
  const user = currentUser(store, req);
  if (!user || seesAllSales(user)) return store.receipts;
  return store.receipts.filter(
    (receipt) => receipt.cashier === user._id && !receipt.dayClosing
  );
}

function summariseReceipts(receipts) {
  const methods = new Map();
  let gross = 0, discount = 0, tax = 0, net = 0, refunded = 0;

  for (const receipt of receipts) {
    gross += Number(receipt.subtotal || 0);
    discount += Number(receipt.discount || 0);
    tax += Number(receipt.tax || 0);
    net += Number(receipt.total || 0);
    refunded += (receipt.refunds || []).reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const hasTenders = Array.isArray(receipt.payments) && receipt.payments.length > 0;
    const tenders = hasTenders
      ? receipt.payments.map((t) => ({ method: t.method, amount: Number(t.amount || 0) }))
      : [{ method: receipt.paymentMethod, amount: Number(receipt.total || 0) }];

    // Change goes back out of the drawer, so it is not takings. Mirrors the
    // real controller's summarise().
    const change = hasTenders ? Number(receipt.changeDue || 0) : 0;
    if (change > 0) {
      const drawer = tenders.find((t) => t.method === "cash") || tenders[0];
      if (drawer) drawer.amount = Math.max(0, drawer.amount - change);
    }

    for (const tender of tenders) {
      const key = tender.method || "unknown";
      const current = methods.get(key) || { method: key, amount: 0, count: 0 };
      current.amount += Number(tender.amount || 0);
      current.count += 1;
      methods.set(key, current);
    }
  }

  return {
    receiptCount: receipts.length,
    gross: money(gross),
    discount: money(discount),
    tax: money(tax),
    net: money(net),
    refunded: money(refunded),
    byMethod: [...methods.values()].map((e) => ({ ...e, amount: money(e.amount) })),
    openedAt: receipts.length ? receipts[receipts.length - 1].createdAt : null,
  };
}

function localStorageRouter(app) {
  const router = express.Router();

  router.post("/auth/login", (req, res) => {
    const store = readStore();
    const { email, password } = req.body;
    // Email is case-insensitive, same as the real login. The password is not.
    const wanted = String(email || "").trim().toLowerCase();
    const user = store.users.find(
      (item) => String(item.email).trim().toLowerCase() === wanted && item.password === password
    );

    if (!user) return res.status(400).json({ message: "Invalid demo credentials" });

    const token = `local-${user._id}`;
    addActivity(store, "User Login", `User ${user.name} logged in.`, "user", user._id, user._id);
    writeStore(store);

    res.json({ message: "login successfully", user: { ...publicUser(user), token } });
  });

  router.post("/auth/signup", (req, res) => {
    const store = readStore();
    const { name, email, password, role = "staff" } = req.body;

    if (store.users.some((user) => user.email === email)) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = { _id: id(), name, email, password, role, ProfilePic: "", createdAt: now(), updatedAt: now() };
    store.users.push(user);
    addActivity(store, "User Signup", `User ${name} signed up.`, "user", user._id, user._id);
    writeStore(store);

    res.status(201).json({ message: "Signup successful", savedUser: { ...publicUser(user), token: `local-${user._id}` } });
  });

  router.post("/auth/logout", (_req, res) => res.json({ message: "Logged out successfully" }));
  router.put("/auth/updateProfile", (req, res) => {
    const store = readStore();
    const token = (req.headers.authorization || "").replace("Bearer local-", "");
    const user = store.users.find((item) => item._id === token) || store.users[0];
    user.ProfilePic = req.body.ProfilePic || user.ProfilePic;
    user.updatedAt = now();
    writeStore(store);
    res.json({ message: "Profile updated successfully", updatedUser: publicUser(user) });
  });
  router.get("/auth/staffuser", (_req, res) => res.json(readStore().users.filter((user) => user.role === "staff").map(publicUser)));
  router.get("/auth/manageruser", (_req, res) => res.json(readStore().users.filter((user) => user.role === "manager").map(publicUser)));
  router.get("/auth/adminuser", (_req, res) => res.json(readStore().users.filter((user) => user.role === "admin").map(publicUser)));
  router.delete("/auth/removeuser/:UserId", (req, res) => {
    const store = readStore();
    store.users = store.users.filter((user) => user._id !== req.params.UserId);
    writeStore(store);
    res.json({ message: "User deleted successfully" });
  });

  router.get("/category/getcategory", (_req, res) => {
    const store = readStore();
    const categoriesWithCount = store.categories.map((category) => ({
      ...category,
      productCount: store.products.filter((product) => product.Category === category._id).length,
    }));
    res.json({ categoriesWithCount });
  });
  // Mirrors the real controller: name required (description optional), no
  // duplicate names, and creating is the owner side's job.
  const sameName = (store, name, exceptId) =>
    store.categories.find(
      (record) =>
        String(record.name).trim().toLowerCase() === String(name).trim().toLowerCase() &&
        record._id !== exceptId
    );

  router.post("/category/createcategory", (req, res) => {
    const store = readStore();
    const user = currentUser(store, req);
    if (user && !["admin", "superadmin"].includes(user.role)) {
      return res.status(403).json({ message: "Access denied. Admin or super admin only." });
    }

    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ message: "Category name is required" });

    const clash = sameName(store, name);
    if (clash) return res.status(400).json({ message: `A category called "${clash.name}" already exists` });

    const category = {
      _id: id(),
      ...req.body,
      name,
      description: String(req.body.description || "").trim(),
      createdAt: now(),
      updatedAt: now(),
    };
    store.categories.push(category);
    addActivity(store, "Add Category", `Category "${category.name}" was added`, "category", category._id);
    writeStore(store);
    res.status(201).json(category);
  });

  router.put("/category/updateCategory/:CategoryId", (req, res) => {
    const store = readStore();
    const category = store.categories.find((record) => record._id === req.params.CategoryId);
    if (!category) return res.status(404).json({ message: "Category is not found" });

    const source =
      req.body.updatedCategory && typeof req.body.updatedCategory === "object"
        ? req.body.updatedCategory
        : req.body;

    if (source.name !== undefined) {
      const name = String(source.name).trim();
      if (!name) return res.status(400).json({ message: "Category name is required" });
      if (category.system && name.toLowerCase() !== String(category.name).toLowerCase()) {
        return res.status(400).json({ message: "This is a system category and cannot be renamed" });
      }
      const clash = sameName(store, name, category._id);
      if (clash) return res.status(400).json({ message: `A category called "${clash.name}" already exists` });
      category.name = name;
    }

    if (source.description !== undefined) category.description = String(source.description).trim();

    category.updatedAt = now();
    addActivity(store, "Update Category", `Category "${category.name}" was updated.`, "category", category._id);
    writeStore(store);
    res.json({ message: "Category successfully updated", category });
  });
  router.get("/category/searchcategory", (req, res) => {
    const query = String(req.query.query || "").toLowerCase();
    res.json(readStore().categories.filter((category) => category.name.toLowerCase().includes(query) || String(category.description).toLowerCase().includes(query)));
  });
  router.delete("/category/removecategory/:CategoryId", (req, res) => {
    const store = readStore();
    store.categories = store.categories.filter((category) => category._id !== req.params.CategoryId);
    writeStore(store);
    res.json({ message: "Category delete successfully" });
  });

  router.get("/product/getproduct", (_req, res) => {
    const store = readStore();
    const Products = store.products.map((product) => populateProduct(store, product));
    res.json({ Products, totalProduct: Products.length });
  });
  const addProductTo = (store, body) => {
    const product = {
      _id: id(),
      name: body.name,
      Desciption: body.Desciption,
      shelfLabel: body.shelfLabel,
      Category: body.Category,
      Price: Number(body.Price),
      quantity: Number(body.quantity || 0),
      lowStockThreshold:
        body.lowStockThreshold !== undefined && body.lowStockThreshold !== ""
          ? Number(body.lowStockThreshold)
          : 10,
      barcode: body.barcode || undefined,
      supplier: body.supplier,
      createdAt: now(),
      updatedAt: now(),
    };
    store.products.push(product);
    addActivity(store, "Add Product", `Product ${product.name} was added`, "product", product._id);
    writeStore(store);
    return product;
  };

  router.post("/product/addproduct", (req, res) => {
    const store = readStore();
    const user = currentUser(store, req);
    // Building the catalogue is the owner side's job.
    if (user && !["admin", "superadmin"].includes(user.role)) {
      return res.status(403).json({ message: "Access denied. Admin or super admin only." });
    }
    res.status(201).json(populateProduct(store, addProductTo(store, req.body)));
  });

  // The till's learn-on-scan path — open to every cashier, barcode required.
  // Returns the real API's { message, product } shape, which the POS modal reads.
  router.post("/product/quick-add", (req, res) => {
    const store = readStore();
    if (!String(req.body.barcode || "").trim()) {
      return res
        .status(400)
        .json({ message: "Quick add is for scanned items — a barcode is required" });
    }
    res.status(201).json({
      message: "Product created successfully",
      product: populateProduct(store, addProductTo(store, req.body)),
    });
  });

  // Generate price-point barcodes into the permanent Random category (demo mode).
  router.post("/product/generate-random", (req, res) => {
    const store = readStore();
    const count = Math.floor(Number(req.body?.count || 0));
    const tiers = (Array.isArray(req.body?.tiers) && req.body.tiers.length ? req.body.tiers : [5, 10, 15])
      .map(Number)
      .filter((v) => Number.isFinite(v) && v > 0);

    if (!count || count < 1 || count > 500) {
      return res.status(400).json({ message: "Count must be between 1 and 500" });
    }

    const hasQuantity = req.body?.quantity !== undefined && req.body?.quantity !== "";
    const stockQuantity = hasQuantity ? Math.floor(Number(req.body.quantity)) : 100000;
    if (!Number.isFinite(stockQuantity) || stockQuantity < 0 || stockQuantity > 1000000) {
      return res.status(400).json({ message: "Quantity must be between 0 and 1,000,000" });
    }

    let category = store.categories.find((c) => c.name === "Random");
    if (!category) {
      category = { _id: id(), name: "Random", description: "System category", system: true, createdAt: now(), updatedAt: now() };
      store.categories.push(category);
    }

    const ean = (seq) => {
      const payload = `20${String(seq).padStart(10, "0")}`.slice(0, 12);
      let sum = 0;
      for (let i = 0; i < 12; i += 1) sum += Number(payload[i]) * (i % 2 === 0 ? 1 : 3);
      return `${payload}${(10 - (sum % 10)) % 10}`;
    };

    store.randomSeq = Number(store.randomSeq || 0);
    const products = [];
    for (let i = 0; i < count; i += 1) {
      const price = tiers[i % tiers.length];
      store.randomSeq += 1;
      const product = {
        _id: id(),
        name: `Random €${price} #${String(store.randomSeq).padStart(4, "0")}`,
        Desciption: "Generated price-point item",
        Category: category._id,
        Price: price,
        quantity: stockQuantity,
        lowStockThreshold: 0,
        barcode: ean(store.randomSeq),
        createdAt: now(),
        updatedAt: now(),
      };
      store.products.push(product);
      products.push({ _id: product._id, name: product.name, Price: price, barcode: product.barcode });
    }

    writeStore(store);
    res.status(201).json({ message: `Generated ${products.length} barcodes`, category: { _id: category._id, name: category.name }, products });
  });
  router.put("/product/editproduct/:productId", (req, res) => {
    const store = readStore();
    const product = store.products.find((item) => item._id === req.params.productId);
    if (!product) return res.status(404).json({ message: "Product not found." });
    Object.assign(product, req.body.updatedData, { updatedAt: now() });
    addActivity(store, "Update Product", `Product "${product.name}" was updated.`, "product", product._id);
    writeStore(store);
    res.json(populateProduct(store, product));
  });
  router.delete("/product/removeproduct/:productId", (req, res) => {
    const store = readStore();
    store.products = store.products.filter((product) => product._id !== req.params.productId);
    writeStore(store);
    res.json({ message: "Product deleted successfully" });
  });
  router.get("/product/searchproduct", (req, res) => {
    const store = readStore();
    const query = String(req.query.query || "").toLowerCase();
    res.json(store.products.map((product) => populateProduct(store, product)).filter((product) =>
      product.name.toLowerCase().includes(query) || String(product.Desciption).toLowerCase().includes(query) || String(product.Category?.name).toLowerCase().includes(query)
    ));
  });
  router.get("/product/getTopProductsByQuantity", (_req, res) => {
    const store = readStore();
    res.json({ success: true, topProducts: [...store.products].sort((a, b) => b.quantity - a.quantity).slice(0, 10) });
  });

  router.get("/product/barcode/:code", (req, res) => {
    const store = readStore();
    const code = String(req.params.code || "").trim();
    const product = store.products.find((record) => record.barcode === code);

    if (!product) {
      return res.status(404).json({ message: "No product with this barcode", barcode: code });
    }

    res.json({ product: populateProduct(store, product) });
  });

  // "Learn on scan": link a freshly scanned barcode to an existing product.
  router.put("/product/:productId/barcode", (req, res) => {
    const store = readStore();
    const barcode = String(req.body?.barcode || "").trim();

    if (!barcode) return res.status(400).json({ message: "Barcode is required" });

    const clash = store.products.find((record) => record.barcode === barcode);
    if (clash && clash._id !== req.params.productId) {
      return res.status(400).json({ message: `Barcode already belongs to ${clash.name}` });
    }

    const product = store.products.find((record) => record._id === req.params.productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    product.barcode = barcode;
    product.updatedAt = now();

    addActivity(store, "Attach Barcode", `Barcode ${barcode} linked to ${product.name}.`, "product", product._id);
    writeStore(store);

    res.json({ message: "Barcode linked successfully", product: populateProduct(store, product) });
  });

  // A supplier supplies many products; older demo rows hold a single id, so
  // both shapes are lifted into a list.
  const suppliedIds = (value) => {
    const list = Array.isArray(value) ? value : value ? [value] : [];
    return [...new Set(list.map((entry) => String(entry?._id || entry)).filter(Boolean))];
  };

  const populateSupplier = (store, supplier) => ({
    ...supplier,
    productsSupplied: suppliedIds(supplier.productsSupplied)
      .map((pid) => populateProduct(store, store.products.find((p) => p._id === pid)))
      .filter(Boolean),
  });

  // Mirrors the real controller: a product has one supplier, so claiming it here
  // takes it off whoever had it before.
  const syncSupplierProducts = (store, supplierId, productIds) => {
    store.suppliers.forEach((other) => {
      if (other._id === supplierId) return;
      other.productsSupplied = suppliedIds(other.productsSupplied).filter(
        (pid) => !productIds.includes(pid)
      );
    });

    store.products.forEach((product) => {
      if (productIds.includes(product._id)) product.supplier = supplierId;
      else if (product.supplier === supplierId) product.supplier = undefined;
    });
  };

  router.get("/supplier/getallsupplier", (_req, res) => {
    const store = readStore();
    res.json(store.suppliers.map((supplier) => populateSupplier(store, supplier)));
  });
  router.post("/supplier/createsupplier", (req, res) => {
    const store = readStore();
    if (!String(req.body.name || "").trim()) {
      return res.status(400).json({ success: false, message: "Supplier name is required." });
    }
    const productIds = suppliedIds(req.body.productsSupplied);
    const supplier = {
      _id: id(),
      ...req.body,
      name: String(req.body.name).trim(),
      productsSupplied: productIds,
      createdAt: now(),
      updatedAt: now(),
    };
    store.suppliers.push(supplier);
    syncSupplierProducts(store, supplier._id, productIds);
    writeStore(store);
    res.status(201).json({
      success: true,
      message: "Supplier created successfully",
      newSupplier: populateSupplier(store, supplier),
    });
  });
  router.get("/supplier/searchSupplier", (req, res) => {
    const query = String(req.query.query || "").toLowerCase();
    res.json({ success: true, suppliers: readStore().suppliers.filter((supplier) => supplier.name.toLowerCase().includes(query)) });
  });
  router.put("/supplier/updatesupplier/:supplierId", (req, res) => {
    const store = readStore();
    const supplier = store.suppliers.find((item) => item._id === req.params.supplierId);
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });

    Object.assign(supplier, req.body, { updatedAt: now() });

    // Only touch the product list if one was actually sent — a rename must not
    // wipe the supplier's products.
    if (req.body.productsSupplied !== undefined) {
      const productIds = suppliedIds(req.body.productsSupplied);
      supplier.productsSupplied = productIds;
      syncSupplierProducts(store, supplier._id, productIds);
    }

    writeStore(store);
    res.json({ message: "Supplier updated successfully", supplier: populateSupplier(store, supplier) });
  });
  router.delete("/supplier/:supplierId", (req, res) => {
    const store = readStore();
    store.suppliers = store.suppliers.filter((supplier) => supplier._id !== req.params.supplierId);
    // Release the products, or they point at a supplier that no longer exists.
    store.products.forEach((product) => {
      if (product.supplier === req.params.supplierId) product.supplier = undefined;
    });
    writeStore(store);
    res.json({ success: true, message: "Supplier deleted successfully" });
  });

  router.get("/order/getorders", (_req, res) => res.json(readStore().orders.map((order) => populateOrder(readStore(), order))));
  router.post("/order/createorder", (req, res) => {
    const store = readStore();

    // Accept the basket shape, and the older single-line shape.
    const requested = Array.isArray(req.body.Products)
      ? req.body.Products
      : req.body.Product?.product
      ? [req.body.Product]
      : [];

    if (requested.length === 0) {
      return res.status(400).json({ message: "Add at least one product to the order" });
    }

    // A purchase order buys stock IN — it does NOT deduct inventory. The stock
    // is only added once the order is received (see /order/receive), so there's
    // no stock check here: you can order any quantity from a supplier.
    const lines = [];
    for (const item of requested) {
      const product = store.products.find((entry) => entry._id === String(item.product));
      if (!product) return res.status(404).json({ message: "Product not found" });

      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ message: `Invalid quantity for ${product.name}` });
      }
      // Price comes from the catalogue, never the request body.
      lines.push({ product: product._id, quantity, price: money(product.Price) });
    }

    const order = {
      _id: id(),
      user: req.body.user,
      Description: req.body.Description,
      status: req.body.status,
      Products: lines,
      totalAmount: money(lines.reduce((sum, line) => sum + line.price * line.quantity, 0)),
      receivedAt: null,
      createdAt: now(),
      updatedAt: now(),
    };
    store.orders.unshift(order);
    addActivity(store, "Create Order", "Order was created.", "order", order._id, req.body.user || "manager-demo");
    writeStore(store);
    res.status(201).json(populateOrder(store, order));
  });
  router.put("/order/updatestatusOrder/:OrderId", (req, res) => {
    const store = readStore();
    const order = store.orders.find((item) => item._id === req.params.OrderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const updates = { ...req.body, updatedAt: now() };
    // The total is never trusted from the client.
    delete updates.totalAmount;

    // If the basket is being edited, re-validate and re-price every line from
    // the catalogue, then recompute the order total.
    if (Array.isArray(updates.Products)) {
      const lines = [];
      for (const item of updates.Products) {
        const product = store.products.find((entry) => entry._id === String(item.product?._id || item.product));
        if (!product) return res.status(404).json({ message: "Product not found" });
        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          return res.status(400).json({ message: `Invalid quantity for ${product.name}` });
        }
        lines.push({ product: product._id, quantity, price: money(product.Price) });
      }
      if (lines.length === 0) {
        return res.status(400).json({ message: "An order must have at least one product" });
      }
      updates.Products = lines;
      updates.totalAmount = money(lines.reduce((sum, line) => sum + line.price * line.quantity, 0));
    } else {
      delete updates.Products;
    }

    Object.assign(order, updates);
    writeStore(store);
    res.json({ message: "Order successfully updated", order: populateOrder(store, order) });
  });
  router.post("/order/receive/:OrderId", (req, res) => {
    const store = readStore();
    const order = store.orders.find((item) => item._id === req.params.OrderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.receivedAt) {
      return res.status(400).json({ message: "This order has already been added to inventory" });
    }
    // Add each line's quantity into inventory — the goods have arrived.
    (order.Products || []).forEach((line) => {
      const product = store.products.find(
        (p) => p._id === String(line.product?._id || line.product)
      );
      if (product) product.quantity += Number(line.quantity || 0);
    });
    order.receivedAt = now();
    order.updatedAt = now();
    addActivity(store, "Receive Order", "Order received — stock added to inventory.", "order", order._id, req.body.user || "admin-demo");
    writeStore(store);
    res.json({
      success: true,
      message: "Order received — stock added to inventory",
      order: populateOrder(store, order),
    });
  });
  router.delete("/order/removeorder/:OrdertId", (req, res) => {
    const store = readStore();
    store.orders = store.orders.filter((order) => order._id !== req.params.OrdertId);
    writeStore(store);
    res.json({ message: "Order deleted successfully" });
  });
  router.get("/order/Searchdata", (req, res) => {
    const store = readStore();
    const query = String(req.query.query || "").toLowerCase();
    res.json(store.orders.map((order) => populateOrder(store, order)).filter((order) => String(order.Description).toLowerCase().includes(query) || String(order.status).toLowerCase().includes(query)));
  });
  router.get("/order/graphstatusorder", (_req, res) => {
    const counts = readStore().orders.reduce((acc, order) => ({ ...acc, [order.status]: (acc[order.status] || 0) + 1 }), {});
    res.json(Object.entries(counts).map(([_id, count]) => ({ _id, count })));
  });

  router.get("/sales/getallsales", (req, res) => {
    const store = readStore();
    const user = currentUser(store, req);
    // Cashiers see only their own not-yet-closed sales, same as the POS history.
    const scoped =
      !user || seesAllSales(user)
        ? store.sales
        : store.sales.filter((sale) => sale.cashier === user._id && !sale.dayClosing);
    res.json({ success: true, sales: scoped.map((sale) => populateSale(store, sale)) });
  });
  router.post("/sales/createsales", (req, res) => {
    const store = readStore();
    const product = store.products.find((item) => item._id === req.body.products?.product);
    if (!product) return res.status(404).json({ message: "Product not found" });
    const quantity = Number(req.body.products.quantity);
    if (product.quantity < quantity) return res.status(400).json({ message: "Insufficient product quantity" });
    product.quantity -= quantity;
    const seller = currentUser(store, req);
    const sale = {
      _id: id(),
      ...req.body,
      totalAmount: quantity * Number(req.body.products.price),
      // So the seller can still find it once per-cashier scoping applies.
      cashier: seller?._id,
      cashierName: seller?.name,
      dayClosing: null,
      createdAt: now(),
      updatedAt: now(),
    };
    store.sales.unshift(sale);
    writeStore(store);
    res.status(201).json({ success: true, message: "Sale created successfully", sale: populateSale(store, sale) });
  });
  router.put("/sales/updatesales/:saleId", (req, res) => {
    const store = readStore();
    const sale = store.sales.find((item) => item._id === req.params.saleId);
    if (!sale) return res.status(404).json({ message: "Sale not found." });
    Object.assign(sale, req.body, { totalAmount: Number(req.body.products.quantity) * Number(req.body.products.price), updatedAt: now() });
    writeStore(store);
    res.json({ success: true, message: "Sale updated successfully", sale: populateSale(store, sale) });
  });
  router.get("/sales/searchdata", (req, res) => {
    const store = readStore();
    const user = currentUser(store, req);
    const query = String(req.query.query || "").toLowerCase();
    // A search must never reach past what this user is allowed to list.
    const scoped =
      !user || seesAllSales(user)
        ? store.sales
        : store.sales.filter((sale) => sale.cashier === user._id && !sale.dayClosing);
    res.json({ sales: scoped.map((sale) => populateSale(store, sale)).filter((sale) => String(sale.customerName).toLowerCase().includes(query) || String(sale.paymentMethod).toLowerCase().includes(query)) });
  });

  router.post("/pos/checkout", (req, res) => {
    const store = readStore();
    // The signed-in demo user owns the sale; the body values are only a fallback.
    const signedIn = currentUser(store, req);
    const {
      customerName = "Walk-in Customer",
      cashierId = signedIn?._id || "manager-demo",
      cashierName = signedIn?.name || "Demo Cashier",
      items = [],
      paymentMethod,
      payments,
      discount = 0,
      discountType = "amount",
      voucherCode,
      amountTendered,
      taxRate = 0,
      taxEnabled = false,
      // Which offers the cashier pressed Apply on. Ghost mode has to price a
      // basket the same way the real till does, or the demo teaches a total
      // the shop will not see.
      dealIds = [],
      dealOverrides = {},
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    const tenders = Array.isArray(payments)
      ? payments
          .map((entry) => ({ method: entry.method, amount: money(entry.amount) }))
          .filter((entry) => entry.method && entry.amount > 0)
      : [];

    if (tenders.length === 0 && !paymentMethod) {
      return res.status(400).json({ message: "Payment method is required" });
    }

    for (const item of items) {
      const product = store.products.find((record) => record._id === item.product);
      const quantity = Number(item.quantity || 0);

      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (quantity <= 0) {
        return res.status(400).json({ message: `Invalid quantity for ${product.name}` });
      }

      if (Number(product.quantity) < quantity) {
        return res.status(400).json({
          message: `Only ${product.quantity} items available for ${product.name}`,
          product: product.name,
          available: product.quantity,
          requested: quantity,
        });
      }
    }

    // Prices come from the store, never from the request body.
    const lines = items.map((item) => {
      const product = store.products.find((record) => record._id === item.product);
      const quantity = Number(item.quantity);
      const price = money(product.Price);
      return { product, quantity, price, lineTotal: money(price * quantity) };
    });

    const subtotal = money(lines.reduce((sum, line) => sum + line.lineTotal, 0));

    let voucher = null;
    let voucherDiscount = 0;

    if (voucherCode) {
      voucher = store.vouchers.find(
        (record) => record.code === String(voucherCode).trim().toUpperCase()
      );

      if (!voucher) {
        return res.status(400).json({ message: "Voucher not found" });
      }

      const reason = voucherRejection(voucher, subtotal);
      if (reason) return res.status(400).json({ message: reason });

      voucherDiscount = voucherDiscountFor(voucher, subtotal);
    }

    const afterVoucher = Math.max(subtotal - voucherDiscount, 0);
    const rawManual =
      discountType === "percent"
        ? (afterVoucher * Number(discount || 0)) / 100
        : Number(discount || 0);
    const manualDiscount = money(Math.max(0, Math.min(rawManual, afterVoucher)));

    // Deals: priced from the active deals and applied against whatever balance
    // is left. Nothing lands on its own — only what the cashier applied.
    const cartMap = new Map();
    for (const line of lines) {
      const key = String(line.product._id);
      const seen = cartMap.get(key);
      cartMap.set(key, { quantity: (seen?.quantity || 0) + line.quantity, price: line.price });
    }
    const dealResult = applicableDeals(
      cartMap,
      store.deals || [],
      (Array.isArray(dealIds) ? dealIds : []).map((id) => String(id)),
      dealOverrides && typeof dealOverrides === 'object' ? dealOverrides : {},
    );
    const dealRoom = Math.max(subtotal - voucherDiscount - manualDiscount, 0);
    const dealDiscount = money(Math.min(dealResult.total, dealRoom));

    const totalDiscount = money(voucherDiscount + manualDiscount + dealDiscount);
    const taxableAmount = Math.max(subtotal - totalDiscount, 0);
    const tax = money(taxEnabled ? taxableAmount * Number(taxRate || 0) : 0);
    const total = money(taxableAmount + tax);

    const paid = tenders.length > 0 ? money(tenders.reduce((sum, e) => sum + e.amount, 0)) : null;

    if (paid !== null && paid + 0.001 < total) {
      return res.status(400).json({
        message: `Short by ${money(total - paid)} — take the rest before closing the sale`,
        total,
        paid,
        remaining: money(total - paid),
      });
    }

    const settledWith =
      tenders.length === 0 ? paymentMethod : tenders.length === 1 ? tenders[0].method : "split";

    const receiptNumber = nextReceiptNo(store);
    const receiptItems = [];
    const saleIds = [];

    for (const line of lines) {
      const { product, quantity, price, lineTotal } = line;

      product.quantity = Number(product.quantity) - quantity;
      product.updatedAt = now();

      // Spread discount and tax across the lines so the Sale rows sum to the
      // receipt total.
      const share = subtotal > 0 ? lineTotal / subtotal : 0;
      const lineDiscount = money(totalDiscount * share);
      const lineTax = money(tax * share);

      const sale = {
        _id: id(),
        customerName,
        receiptNo: receiptNumber,
        cashier: cashierId,
        cashierName,
        products: {
          product: product._id,
          quantity,
          price,
        },
        totalAmount: money(lineTotal - lineDiscount + lineTax),
        discount: lineDiscount,
        tax: lineTax,
        paymentStatus: "paid",
        paymentMethod: settledWith,
        status: "completed",
        source: "pos",
        createdAt: now(),
        updatedAt: now(),
      };

      store.sales.unshift(sale);
      saleIds.push(sale._id);

      store.stockTransactions.unshift({
        _id: id(),
        product: product._id,
        type: "Stock-out",
        quantity,
        supplier: product.supplier,
        reference: receiptNumber,
        transactionDate: now(),
        createdAt: now(),
        updatedAt: now(),
      });

      if (product.quantity <= 10) {
        store.notifications.unshift({
          _id: id(),
          name: "Low stock alert",
          type: `${product.name} has ${product.quantity} units remaining after POS sale ${receiptNumber}.`,
          createdAt: now(),
          updatedAt: now(),
        });
      }

      receiptItems.push({
        product: product._id,
        barcode: product.barcode,
        name: product.name,
        quantity,
        price,
        lineTotal,
      });
    }

    if (voucher) {
      voucher.usedCount = Number(voucher.usedCount || 0) + 1;
      voucher.redeemedAt = now();
      voucher.redeemedOn = receiptNumber;
      if (voucher.usedCount >= Number(voucher.usageLimit || 1)) voucher.status = "used";
    }

    const tendered =
      paid !== null
        ? paid
        : amountTendered === undefined || amountTendered === null
        ? undefined
        : money(amountTendered);

    const receipt = {
      _id: id(),
      receiptNo: receiptNumber,
      cashier: cashierId,
      cashierName,
      customerName,
      items: receiptItems,
      subtotal,
      discount: totalDiscount,
      discountType,
      dealDiscount,
      deals: dealResult.applied.map((entry) => ({
        dealId: entry.dealId,
        name: entry.name,
        sets: entry.sets,
        amount: entry.amount,
      })),
      voucher: voucher ? { code: voucher.code, voucherId: voucher._id, amount: voucherDiscount } : undefined,
      taxEnabled,
      taxRate: Number(taxRate || 0),
      tax,
      total,
      payments: tenders,
      paymentMethod: settledWith,
      amountTendered: tendered,
      changeDue: tendered === undefined ? undefined : money(Math.max(0, tendered - total)),
      status: "completed",
      refunds: [],
      // Open until the cashier closes their day and hands it to the admin.
      dayClosing: null,
      saleIds,
      createdAt: now(),
      updatedAt: now(),
    };

    store.receipts.unshift(receipt);

    addActivity(
      store,
      "POS Checkout",
      `Receipt ${receiptNumber} completed for ${customerName}.`,
      "order",
      null,
      cashierId
    );

    writeStore(store);

    res.status(201).json({
      success: true,
      message: "POS checkout completed",
      receipt,
    });
  });

  router.get("/pos/receipts", (req, res) => {
    const store = readStore();
    const limit = Math.min(Number(req.query.limit || 25), 100);
    res.json({ receipts: scopeReceipts(store, req).slice(0, limit) });
  });

  router.get("/pos/receipt/:receiptNo", (req, res) => {
    const store = readStore();
    const user = currentUser(store, req);
    const receipt = store.receipts.find(
      (record) => record.receiptNo === String(req.params.receiptNo).toUpperCase()
    );
    if (!receipt) return res.status(404).json({ message: "Receipt not found" });

    // Staff only get their own; manager and above can look any receipt up by
    // its printed number, which is what a counter refund needs.
    const canLookupAny = !user || seesAllSales(user) || user.role === "manager";
    if (!canLookupAny && receipt.cashier !== user._id) {
      return res.status(404).json({ message: "Receipt not found" });
    }

    res.json({ receipt });
  });

  // --- Day closing ------------------------------------------------------
  const myOpenReceipts = (store, req) => {
    const user = currentUser(store, req);
    if (!user) return [];
    return store.receipts
      .filter((receipt) => receipt.cashier === user._id && !receipt.dayClosing)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  };

  router.get("/pos/day-closing/summary", (req, res) => {
    const store = readStore();
    const user = currentUser(store, req);
    res.json({
      summary: summariseReceipts(myOpenReceipts(store, req)),
      cashierName: user?.name,
    });
  });

  router.post("/pos/day-closing/close", (req, res) => {
    const store = readStore();
    const user = currentUser(store, req);
    if (!user) return res.status(401).json({ message: "Not signed in" });

    const open = myOpenReceipts(store, req);
    if (open.length === 0) {
      return res.status(400).json({ message: "There are no open sales to close" });
    }

    const summary = summariseReceipts(open);
    const closing = {
      _id: id(),
      reference: nextDayClosingNo(store),
      cashier: user._id,
      cashierName: user.name,
      cashierRole: user.role,
      openedAt: open[0].createdAt,
      closedAt: now(),
      receiptCount: summary.receiptCount,
      receiptNos: open.map((receipt) => receipt.receiptNo),
      receipts: open.map((receipt) => receipt._id),
      gross: summary.gross,
      discount: summary.discount,
      tax: summary.tax,
      net: summary.net,
      refunded: summary.refunded,
      byMethod: summary.byMethod,
      createdAt: now(),
      updatedAt: now(),
    };

    if (!store.dayClosings) store.dayClosings = [];
    store.dayClosings.unshift(closing);

    const closedIds = new Set(open.map((receipt) => receipt._id));
    const saleIds = new Set(open.flatMap((receipt) => receipt.saleIds || []));
    store.receipts.forEach((receipt) => {
      if (closedIds.has(receipt._id)) receipt.dayClosing = closing._id;
    });
    store.sales.forEach((sale) => {
      if (saleIds.has(sale._id)) sale.dayClosing = closing._id;
    });

    addActivity(
      store,
      "POS Day Closing",
      `${user.name} closed ${summary.receiptCount} sale(s) totalling ${summary.net} as ${closing.reference}.`,
      "order",
      closing._id,
      user._id
    );
    writeStore(store);

    res.status(201).json({
      success: true,
      message: `Day closed — ${summary.receiptCount} sale(s) handed over`,
      closing,
    });
  });

  router.get("/pos/day-closings", (req, res) => {
    const store = readStore();
    const user = currentUser(store, req);
    if (user && !seesAllSales(user)) {
      return res.status(403).json({ message: "Access denied. Admin or super admin only." });
    }
    const limit = Math.min(Number(req.query.limit || 50), 200);
    res.json({ closings: (store.dayClosings || []).slice(0, limit) });
  });

  router.get("/pos/day-closings/:closingId", (req, res) => {
    const store = readStore();
    const user = currentUser(store, req);
    if (user && !seesAllSales(user)) {
      return res.status(403).json({ message: "Access denied. Admin or super admin only." });
    }
    const closing = (store.dayClosings || []).find((record) => record._id === req.params.closingId);
    if (!closing) return res.status(404).json({ message: "Day closing not found" });

    const receipts = store.receipts.filter((receipt) => closing.receipts.includes(receipt._id));
    res.json({ closing: { ...closing, receipts } });
  });

  const applyRefund = (store, receipt, requested, reason, isVoid) => {
    const already = new Map();
    receipt.refunds.forEach((refund) =>
      refund.items.forEach((item) =>
        already.set(item.product, (already.get(item.product) || 0) + Number(item.quantity || 0))
      )
    );

    const lines = [];

    for (const item of receipt.items) {
      const outstanding = item.quantity - (already.get(item.product) || 0);
      const match = requested.find((entry) => String(entry.product) === item.product);
      const quantity = requested.length === 0 ? outstanding : match ? Number(match.quantity || 0) : 0;

      if (quantity <= 0) continue;

      if (quantity > outstanding) {
        return {
          error: `Cannot refund ${quantity} x ${item.name} — only ${outstanding} left on this receipt`,
        };
      }

      const ratio = receipt.subtotal ? receipt.total / receipt.subtotal : 1;
      lines.push({
        product: item.product,
        name: item.name,
        quantity,
        price: item.price,
        lineTotal: money(item.price * quantity * ratio),
      });
    }

    if (lines.length === 0) return { error: "Nothing left to refund on this receipt" };

    const amount = money(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    const reference = `RFD-${receipt.receiptNo}`;

    lines.forEach((line) => {
      const product = store.products.find((record) => record._id === line.product);
      if (product) {
        product.quantity = Number(product.quantity) + line.quantity;
        product.updatedAt = now();
      }

      store.stockTransactions.unshift({
        _id: id(),
        product: line.product,
        type: "Stock-in",
        quantity: line.quantity,
        reference,
        transactionDate: now(),
        createdAt: now(),
        updatedAt: now(),
      });

      store.sales.unshift({
        _id: id(),
        customerName: receipt.customerName,
        receiptNo: reference,
        cashier: receipt.cashier,
        cashierName: receipt.cashierName,
        products: { product: line.product, quantity: line.quantity, price: line.price },
        totalAmount: -line.lineTotal,
        paymentStatus: "paid",
        paymentMethod: receipt.paymentMethod,
        status: "cancelled",
        source: "refund",
        createdAt: now(),
        updatedAt: now(),
      });
    });

    receipt.refunds.push({
      at: now(),
      by: receipt.cashier,
      byName: receipt.cashierName,
      reason: reason || (isVoid ? "void" : "refund"),
      amount,
      items: lines,
    });

    const after = new Map();
    receipt.refunds.forEach((refund) =>
      refund.items.forEach((item) =>
        after.set(item.product, (after.get(item.product) || 0) + Number(item.quantity || 0))
      )
    );
    const fully = receipt.items.every((item) => (after.get(item.product) || 0) >= item.quantity);

    receipt.status = isVoid ? "voided" : fully ? "refunded" : "partially-refunded";
    receipt.updatedAt = now();

    return { amount, lines };
  };

  router.post("/pos/refund", (req, res) => {
    const store = readStore();
    const { receiptNo, items = [], reason } = req.body;

    const receipt = store.receipts.find(
      (record) => record.receiptNo === String(receiptNo || "").toUpperCase()
    );

    if (!receipt) return res.status(404).json({ message: "Receipt not found" });
    if (receipt.status === "voided" || receipt.status === "refunded") {
      return res.status(400).json({ message: `This receipt is already ${receipt.status}` });
    }

    const result = applyRefund(store, receipt, items, reason, false);
    if (result.error) return res.status(400).json({ message: result.error });

    addActivity(store, "POS Refund", `Refunded ${result.amount} on receipt ${receipt.receiptNo}.`, "order", receipt._id);
    writeStore(store);

    res.json({
      success: true,
      message: `Refunded ${result.amount}`,
      receiptNo: receipt.receiptNo,
      status: receipt.status,
      amount: result.amount,
      items: result.lines,
    });
  });

  router.post("/pos/void/:receiptNo", (req, res) => {
    const store = readStore();
    const receipt = store.receipts.find(
      (record) => record.receiptNo === String(req.params.receiptNo).toUpperCase()
    );

    if (!receipt) return res.status(404).json({ message: "Receipt not found" });
    if (receipt.status !== "completed") {
      return res.status(400).json({ message: `This receipt is already ${receipt.status}` });
    }

    const result = applyRefund(store, receipt, [], req.body?.reason || "void", true);
    if (result.error) return res.status(400).json({ message: result.error });

    addActivity(store, "POS Void", `Voided receipt ${receipt.receiptNo}.`, "order", receipt._id);
    writeStore(store);

    res.json({ success: true, message: `Receipt ${receipt.receiptNo} voided`, amount: result.amount, status: receipt.status });
  });

  router.post("/pos/hold", (req, res) => {
    const store = readStore();
    const { items = [] } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cannot suspend an empty sale" });
    }

    const held = { _id: id(), cashierName: "Demo Cashier", ...req.body, createdAt: now(), updatedAt: now() };
    store.heldSales.unshift(held);
    writeStore(store);

    res.status(201).json({ success: true, held });
  });

  router.get("/pos/held", (_req, res) => {
    const store = readStore();
    res.json({ held: store.heldSales });
  });

  router.delete("/pos/held/:heldId", (req, res) => {
    const store = readStore();
    const before = store.heldSales.length;
    store.heldSales = store.heldSales.filter((sale) => sale._id !== req.params.heldId);

    if (store.heldSales.length === before) {
      return res.status(404).json({ message: "Held sale not found" });
    }

    writeStore(store);
    res.json({ success: true, message: "Held sale removed" });
  });

  router.post("/voucher/create", (req, res) => {
    const store = readStore();
    const { code, type, value, minSpend, expiresAt, usageLimit } = req.body;

    if (!code || !String(code).trim()) return res.status(400).json({ message: "Voucher code is required" });
    if (type !== "amount" && type !== "percent") {
      return res.status(400).json({ message: "Voucher type must be amount or percent" });
    }
    if (!Number(value) || Number(value) <= 0) {
      return res.status(400).json({ message: "Voucher value must be greater than zero" });
    }

    const normalized = String(code).trim().toUpperCase();

    if (store.vouchers.some((voucher) => voucher.code === normalized)) {
      return res.status(400).json({ message: "A voucher with this code already exists" });
    }

    const voucher = {
      _id: id(),
      code: normalized,
      type,
      value: Number(value),
      minSpend: Number(minSpend || 0),
      expiresAt: expiresAt || undefined,
      usageLimit: Number(usageLimit || 1),
      usedCount: 0,
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    };

    store.vouchers.unshift(voucher);
    writeStore(store);

    res.status(201).json({ message: "Voucher created successfully", voucher });
  });

  router.get("/voucher/all", (_req, res) => {
    const store = readStore();
    res.json({ vouchers: store.vouchers });
  });

  router.put("/voucher/:voucherId/disable", (req, res) => {
    const store = readStore();
    const voucher = store.vouchers.find((record) => record._id === req.params.voucherId);

    if (!voucher) return res.status(404).json({ message: "Voucher not found" });

    voucher.status = "disabled";
    voucher.updatedAt = now();
    writeStore(store);

    res.json({ message: "Voucher disabled", voucher });
  });

  router.delete("/voucher/:voucherId", (req, res) => {
    const store = readStore();
    const before = store.vouchers.length;
    store.vouchers = store.vouchers.filter((voucher) => voucher._id !== req.params.voucherId);

    if (store.vouchers.length === before) return res.status(404).json({ message: "Voucher not found" });

    writeStore(store);
    res.json({ message: "Voucher deleted successfully" });
  });

  router.post("/voucher/validate", (req, res) => {
    const store = readStore();
    const { code, subtotal: rawSubtotal } = req.body || {};

    if (!code || !String(code).trim()) {
      return res.status(400).json({ valid: false, message: "Voucher code is required" });
    }

    const subtotal = Number(rawSubtotal || 0);
    const voucher = store.vouchers.find(
      (record) => record.code === String(code).trim().toUpperCase()
    );

    if (!voucher) return res.status(404).json({ valid: false, message: "Voucher not found" });

    const reason = voucherRejection(voucher, subtotal);
    if (reason) return res.status(400).json({ valid: false, message: reason });

    res.json({
      valid: true,
      code: voucher.code,
      type: voucher.type,
      value: voucher.value,
      computedDiscount: voucherDiscountFor(voucher, subtotal),
    });
  });

  // --- Deals (bundle discounts) -----------------------------------------
  const populateDeal = (store, deal) => ({
    ...deal,
    items: (deal.items || []).map((item) => {
      const product = store.products.find((record) => record._id === String(item.product));
      return {
        product: product
          ? { _id: product._id, name: product.name, Price: product.Price, barcode: product.barcode }
          : { _id: String(item.product) },
        quantity: item.quantity,
      };
    }),
  });

  const normaliseDealItems = (store, raw) => {
    const map = new Map();
    (Array.isArray(raw) ? raw : []).forEach((entry) => {
      const pid = String(entry?.product || entry?._id || entry || "").trim();
      if (!store.products.some((record) => record._id === pid)) return;
      const quantity = Math.max(1, Math.floor(Number(entry?.quantity || 1)) || 1);
      map.set(pid, (map.get(pid) || 0) + quantity);
    });
    return [...map.entries()].map(([product, quantity]) => ({ product, quantity }));
  };
  const dealUnitCount = (items) =>
    (Array.isArray(items) ? items : []).reduce(
      (sum, item) => sum + Math.max(1, Math.floor(Number(item.quantity || 1)) || 1),
      0
    );

  router.get("/deal/all", (_req, res) => {
    const store = readStore();
    res.json({ deals: (store.deals || []).map((deal) => populateDeal(store, deal)) });
  });

  router.post("/deal/create", (req, res) => {
    const store = readStore();
    const { name, discount, discountType = "amount", items } = req.body;

    if (!name || !String(name).trim()) return res.status(400).json({ message: "Deal name is required" });
    if (!Number(discount) || Number(discount) <= 0) {
      return res.status(400).json({ message: "Deal discount must be greater than zero" });
    }
    if (discountType !== "amount" && discountType !== "percent") {
      return res.status(400).json({ message: "Deal discount type must be amount or percent" });
    }
    if (discountType === "percent" && Number(discount) > 100) {
      return res.status(400).json({ message: "A percentage deal cannot exceed 100%" });
    }

    const cleanItems = normaliseDealItems(store, items);
    if (dealUnitCount(cleanItems) < 2) {
      return res.status(400).json({ message: "Pick at least two units or products for the deal" });
    }

    if (!store.deals) store.deals = [];
    const deal = {
      _id: id(),
      name: String(name).trim(),
      discount: Number(discount),
      discountType,
      items: cleanItems,
      active: true,
      createdAt: now(),
      updatedAt: now(),
    };
    store.deals.unshift(deal);
    writeStore(store);

    res.status(201).json({ message: "Deal created successfully", deal: populateDeal(store, deal) });
  });

  router.put("/deal/:dealId", (req, res) => {
    const store = readStore();
    const deal = (store.deals || []).find((record) => record._id === req.params.dealId);
    if (!deal) return res.status(404).json({ message: "Deal not found" });

    const { name, discount, discountType, items, active } = req.body;
    if (name !== undefined) deal.name = String(name).trim();
    if (discount !== undefined || discountType !== undefined) {
      const nextType = discountType !== undefined ? discountType : deal.discountType || "amount";
      const nextAmount = discount !== undefined ? Number(discount) : Number(deal.discount);
      if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
        return res.status(400).json({ message: "Deal discount must be greater than zero" });
      }
      if (nextType === "percent" && nextAmount > 100) {
        return res.status(400).json({ message: "A percentage deal cannot exceed 100%" });
      }
      deal.discount = nextAmount;
      deal.discountType = nextType;
    }
    if (items !== undefined) {
      const cleanItems = normaliseDealItems(store, items);
      if (dealUnitCount(cleanItems) < 2) {
        return res.status(400).json({ message: "Pick at least two units or products for the deal" });
      }
      deal.items = cleanItems;
    }
    if (active !== undefined) deal.active = Boolean(active);
    deal.updatedAt = now();
    writeStore(store);

    res.json({ message: "Deal updated", deal: populateDeal(store, deal) });
  });

  router.delete("/deal/:dealId", (req, res) => {
    const store = readStore();
    const before = (store.deals || []).length;
    store.deals = (store.deals || []).filter((deal) => deal._id !== req.params.dealId);
    if (store.deals.length === before) return res.status(404).json({ message: "Deal not found" });
    writeStore(store);
    res.json({ message: "Deal deleted successfully" });
  });


  // --- Store details (demo) --------------------------------------------
  const DEFAULT_STORE = {
    key: "shop",
    name: "Candy Cloud",
    addressLines: ["10 Abbeygate Street", "Lower, H91 KV7K"],
    phone: "",
    currency: "EUR",
    timezone: "Europe/Dublin",
    footer: "Thank you for shopping with us",
    qrTemplate: "{ref}",
  };

  router.get("/store", (_req, res) => {
    const store = readStore();
    if (!store.shop) { store.shop = { ...DEFAULT_STORE, createdAt: now(), updatedAt: now() }; writeStore(store); }
    res.json({ store: store.shop });
  });

  router.put("/store", (req, res) => {
    const store = readStore();
    const user = currentUser(store, req);
    if (user && user.role !== "superadmin") {
      return res.status(403).json({ message: "Access denied. Super admin only." });
    }
    const shop = store.shop || { ...DEFAULT_STORE };
    const { name, addressLines, phone, currency, timezone, notificationsEmail, footer, qrTemplate } =
      req.body;

    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: "Store name is required" });
      shop.name = String(name).trim();
    }
    if (timezone !== undefined) {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone });
        shop.timezone = timezone;
      } catch {
        return res.status(400).json({ message: `"${timezone}" is not a recognised timezone` });
      }
    }
    if (addressLines !== undefined) {
      // The form sends a textarea: one address line per row.
      const lines = Array.isArray(addressLines)
        ? addressLines
        : String(addressLines).split(/\r?\n/);
      shop.addressLines = lines.map((l) => String(l).trim()).filter(Boolean);
    }
    if (phone !== undefined) shop.phone = String(phone).trim();
    if (currency !== undefined) {
      if (!CURRENCIES.includes(currency)) {
        return res
          .status(400)
          .json({ message: `Currency must be one of: ${CURRENCIES.join(", ")}` });
      }
      shop.currency = currency;
    }
    if (notificationsEmail !== undefined) {
      const clean = String(notificationsEmail).trim();
      if (clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
        return res.status(400).json({ message: "Notifications email is not a valid email address" });
      }
      shop.notificationsEmail = clean;
    }
    if (footer !== undefined) shop.footer = String(footer).trim();
    if (qrTemplate !== undefined) shop.qrTemplate = String(qrTemplate).trim() || "{ref}";

    shop.updatedAt = now();
    store.shop = shop;
    addActivity(
      store,
      "Update Store",
      `Store details updated — now trading as "${shop.name}".`,
      "system",
      null,
      user && user._id
    );
    writeStore(store);
    res.json({ message: "Store details updated", store: shop });
  });

  // Reorders are a Mongo-mode feature (auto low-stock + supplier email). In the
  // offline demo there's no mail, so just return an empty queue so the page
  // loads cleanly instead of 404-ing.
  router.get("/reorder", (req, res) => res.json({ reorders: [], pending: 0 }));

  const ghostReportReceipts = (store, query) => {
    let list = [...(store.receipts || [])];

    if (query.cashier) {
      list = list.filter((receipt) => String(receipt.cashier) === String(query.cashier));
    }
    if (query.from) {
      const start = new Date(`${query.from}T00:00:00`).getTime();
      list = list.filter((receipt) => new Date(receipt.createdAt).getTime() >= start);
    }
    if (query.to) {
      const end = new Date(`${query.to}T23:59:59.999`).getTime();
      list = list.filter((receipt) => new Date(receipt.createdAt).getTime() <= end);
    }
    if (query.status) {
      list = list.filter((receipt) => receipt.status === query.status);
    }

    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  };

  router.get("/reports/ghost-net/preview", (req, res) => {
    try {
      const store = readStore();
      const user = currentUser(store, req);
      if (user && user.role !== "superadmin") {
        return res.status(403).json({ message: "Access denied. Super admin only." });
      }

      const receipts = ghostReportReceipts(store, req.query);
      return res.json({
        period: req.query.from && req.query.to
          ? `Period: ${req.query.from} to ${req.query.to}`
          : req.query.from
            ? `Period: from ${req.query.from}`
            : req.query.to
              ? `Period: up to ${req.query.to}`
              : "Period: All time",
        receipts: receipts.length,
        existingNet: currentNetTotal(receipts),
      });
    } catch (error) {
      return res.status(500).json({
        message: "Could not calculate existing net sales",
        error: error.message,
      });
    }
  });

  router.get("/reports/ghost-net", async (req, res) => {
    try {
      const store = readStore();
      const user = currentUser(store, req);
      if (user && user.role !== "superadmin") {
        return res.status(403).json({ message: "Access denied. Super admin only." });
      }

      const requested = String(req.query.format || "xlsx").toLowerCase();
      const format = REPORT_FORMATS[requested];
      if (!format) {
        return res.status(400).json({
          message: `Unsupported format "${requested}". Use one of: ${Object.keys(REPORT_FORMATS).join(", ")}`,
        });
      }

      const shop = store.shop || { ...DEFAULT_STORE };
      const report = buildShadowNetReport(ghostReportReceipts(store, req.query), req.query);
      const buffer = await format.build({
        reportType: "ghost-net",
        title: report.title,
        subtitle: report.subtitle,
        generatedBy: `${user?.name || "Demo User"} (${user?.role || "demo"})`,
        headers: report.headers,
        rows: report.rows,
        summary: report.summary,
        shop,
        currency: shop.currency || "EUR",
      });

      const slug = String(shop.name || "report")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const filename = `${slug}-ghost-net-${formatDate(new Date())}.${format.extension}`;
      res.setHeader("Content-Type", format.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      return res.status(200).send(buffer);
    } catch (error) {
      const status = error.statusCode || 500;
      return res.status(status).json({
        message: status === 500 ? "Failed to generate report" : error.message,
        error: error.message,
      });
    }
  });

  // Ghost mode (demo): every sale, unscoped. Owner only.
  router.get("/pos/all-sales", (req, res) => {
    const store = readStore();
    const user = currentUser(store, req);
    if (user && user.role !== "superadmin") {
      return res.status(403).json({ message: "Access denied. Super admin only." });
    }

    let list = [...store.receipts];
    if (req.query.cashier) list = list.filter((r) => r.cashier === req.query.cashier);
    if (req.query.status) list = list.filter((r) => r.status === req.query.status);
    if (req.query.from) list = list.filter((r) => new Date(r.createdAt) >= new Date(req.query.from + "T00:00:00"));
    if (req.query.to) list = list.filter((r) => new Date(r.createdAt) <= new Date(req.query.to + "T23:59:59.999"));

    const limit = Math.min(Number(req.query.limit || 50), 200);
    const page = Math.max(Number(req.query.page || 1), 1);

    const totals = list.reduce((acc, r) => ({
      net: acc.net + Number(r.total || 0),
      gross: acc.gross + Number(r.subtotal || 0),
      discount: acc.discount + Number(r.discount || 0),
      tax: acc.tax + Number(r.tax || 0),
    }), { net: 0, gross: 0, discount: 0, tax: 0 });

    const byCashierMap = new Map();
    list.forEach((r) => {
      const k = r.cashier || "unknown";
      const cur = byCashierMap.get(k) || { cashier: k, name: r.cashierName, net: 0, count: 0 };
      cur.net += Number(r.total || 0); cur.count += 1;
      byCashierMap.set(k, cur);
    });

    res.json({
      receipts: list.slice((page - 1) * limit, page * limit),
      page,
      pages: Math.max(Math.ceil(list.length / limit), 1),
      total: list.length,
      totals: { net: money(totals.net), gross: money(totals.gross), discount: money(totals.discount), tax: money(totals.tax) },
      byCashier: [...byCashierMap.values()].map((e) => ({ ...e, net: money(e.net) })).sort((a, b) => b.net - a.net),
    });
  });

  router.get("/stocktransaction/getallStockTransaction", (_req, res) => {
    const store = readStore();
    res.json({ message: "Stock transactions fetched", transactions: store.stockTransactions.map((transaction) => populateStockTransaction(store, transaction)) });
  });
  router.post("/stocktransaction/createStockTransaction", (req, res) => {
    const store = readStore();
    const transaction = { _id: id(), ...req.body, transactionDate: now(), createdAt: now(), updatedAt: now() };
    store.stockTransactions.unshift(transaction);
    writeStore(store);
    res.status(201).json(populateStockTransaction(store, transaction));
  });
  router.get("/stocktransaction/searchstocks", (req, res) => {
    const store = readStore();
    const query = String(req.query.query || "").toLowerCase();
    res.json(store.stockTransactions.map((stock) => populateStockTransaction(store, stock)).filter((stock) =>
      String(stock.type).toLowerCase().includes(query) ||
      String(stock.product?.name).toLowerCase().includes(query) ||
      String(stock.supplier?.name).toLowerCase().includes(query)
    ));
  });

  router.get("/notification/allNotification", (_req, res) => res.json(readStore().notifications));
  router.post("/notification/createNotification", (req, res) => {
    const store = readStore();
    const notification = { _id: id(), ...req.body, createdAt: now(), updatedAt: now() };
    store.notifications.unshift(notification);
    writeStore(store);
    app.get("io").emit("newNotification", notification);
    res.status(201).json({ success: true, message: "Notification created successfully.", notification });
  });
  router.delete("/notification/deleteNotification/:id", (req, res) => {
    const store = readStore();
    store.notifications = store.notifications.filter((notification) => notification._id !== req.params.id);
    writeStore(store);
    res.json({ success: true, message: "Notification deleted successfully." });
  });

  router.get("/activitylogs/getAllLogs", (_req, res) => {
    const store = readStore();
    res.json(store.activityLogs.map((log) => ({ ...log, userId: publicUser(store.users.find((user) => user._id === log.userId)) || {} })));
  });
  router.get("/activitylogs/getrecentActivitys", (_req, res) => {
    const store = readStore();
    res.json(store.activityLogs.slice(0, 3).map((log) => ({ ...log, userId: publicUser(store.users.find((user) => user._id === log.userId)) || {} })));
  });
  router.get("/activitylogs/getLogs/:userid", (req, res) => {
    const store = readStore();
    res.json(store.activityLogs.filter((log) => log.userId === req.params.userid));
  });

  return router;
}

module.exports = localStorageRouter;
