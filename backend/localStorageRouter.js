const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "local-store.json");
const storeVersion = 3;

const now = () => new Date().toISOString();
const id = () => crypto.randomBytes(12).toString("hex");

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
      productsSupplied: "prod-vaporx",
      createdAt: daysAgo(29),
      updatedAt: daysAgo(4),
    },
    {
      _id: "sup-cloudnine",
      name: "CloudNine Wholesale",
      contactInfo: { phone: "555-0177", email: "supply@cloudnine.example", address: "72 Market Street, San Diego, CA" },
      productsSupplied: "prod-mint",
      createdAt: daysAgo(27),
      updatedAt: daysAgo(6),
    },
    {
      _id: "sup-pacific",
      name: "Pacific Vape Supply",
      contactInfo: { phone: "555-0188", email: "sales@pacificvape.example", address: "404 Commerce Drive, Irvine, CA" },
      productsSupplied: "prod-pods",
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
    { _id: "ord-1001", user: "manager-demo", Description: "Online order for starter kit bundle", Product: { product: "prod-vaporx", quantity: 2, price: 59.99 }, totalAmount: 119.98, status: "delivered", createdAt: daysAgo(7), updatedAt: daysAgo(5) },
    { _id: "ord-1002", user: "staff-demo", Description: "Counter pickup for mint refill", Product: { product: "prod-mint", quantity: 4, price: 15.99 }, totalAmount: 63.96, status: "shipped", createdAt: daysAgo(5), updatedAt: daysAgo(3) },
    { _id: "ord-1003", user: "manager-demo", Description: "Replacement pods for VIP customer", Product: { product: "prod-pods", quantity: 3, price: 12.99 }, totalAmount: 38.97, status: "pending", createdAt: daysAgo(3), updatedAt: daysAgo(3) },
    { _id: "ord-1004", user: "admin-demo", Description: "Accessory reorder for front display", Product: { product: "prod-charger", quantity: 5, price: 8.99 }, totalAmount: 44.95, status: "pending", createdAt: daysAgo(1), updatedAt: daysAgo(1) },
  ];
  const sales = [
    { _id: "sale-2001", customerName: "Jordan Lee", products: { product: "prod-vaporx", quantity: 1, price: 59.99 }, totalAmount: 59.99, paymentStatus: "paid", paymentMethod: "creditcard", status: "completed", createdAt: daysAgo(6), updatedAt: daysAgo(6) },
    { _id: "sale-2002", customerName: "Avery Smith", products: { product: "prod-mango", quantity: 3, price: 16.99 }, totalAmount: 50.97, paymentStatus: "paid", paymentMethod: "cash", status: "completed", createdAt: daysAgo(5), updatedAt: daysAgo(5) },
    { _id: "sale-2003", customerName: "Taylor Morgan", products: { product: "prod-pods", quantity: 2, price: 12.99 }, totalAmount: 25.98, paymentStatus: "pending", paymentMethod: "banktransfer", status: "pending", createdAt: daysAgo(4), updatedAt: daysAgo(3) },
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
  return {
    ...order,
    user: publicUser(store.users.find((user) => user._id === order.user)),
    Product: {
      ...order.Product,
      product: populateProduct(store, store.products.find((product) => product._id === order.Product?.product)),
    },
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

function nextReceiptNo(store) {
  const sequence = Number(store.posSequence || 1000) + 1;
  store.posSequence = sequence;
  return `POS-${String(sequence).padStart(6, "0")}`;
}

function localStorageRouter(app) {
  const router = express.Router();

  router.post("/auth/login", (req, res) => {
    const store = readStore();
    const { email, password } = req.body;
    const user = store.users.find((item) => item.email === email && item.password === password);

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
  router.post("/category/createcategory", (req, res) => {
    const store = readStore();
    const category = { _id: id(), ...req.body, createdAt: now(), updatedAt: now() };
    store.categories.push(category);
    addActivity(store, "Add Category", `Category "${category.name}" was added`, "category", category._id);
    writeStore(store);
    res.status(201).json(category);
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
  router.post("/product/addproduct", (req, res) => {
    const store = readStore();
    const product = {
      _id: id(),
      name: req.body.name,
      Desciption: req.body.Desciption,
      Category: req.body.Category,
      Price: Number(req.body.Price),
      quantity: Number(req.body.quantity),
      supplier: req.body.supplier,
      createdAt: now(),
      updatedAt: now(),
    };
    store.products.push(product);
    addActivity(store, "Add Product", `Product ${product.name} was added`, "product", product._id);
    writeStore(store);
    res.status(201).json(populateProduct(store, product));
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

  router.get("/supplier/getallsupplier", (_req, res) => {
    const store = readStore();
    res.json(store.suppliers.map((supplier) => ({
      ...supplier,
      productsSupplied: populateProduct(store, store.products.find((product) => product._id === supplier.productsSupplied)),
    })));
  });
  router.post("/supplier/createsupplier", (req, res) => {
    const store = readStore();
    const supplier = { _id: id(), ...req.body, createdAt: now(), updatedAt: now() };
    store.suppliers.push(supplier);
    writeStore(store);
    res.status(201).json({ success: true, message: "Supplier created successfully", newSupplier: supplier });
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
    writeStore(store);
    res.json({ message: "Supplier updated successfully", supplier });
  });
  router.delete("/supplier/:supplierId", (req, res) => {
    const store = readStore();
    store.suppliers = store.suppliers.filter((supplier) => supplier._id !== req.params.supplierId);
    writeStore(store);
    res.json({ success: true, message: "Supplier deleted successfully" });
  });

  router.get("/order/getorders", (_req, res) => res.json(readStore().orders.map((order) => populateOrder(readStore(), order))));
  router.post("/order/createorder", (req, res) => {
    const store = readStore();
    const product = store.products.find((item) => item._id === req.body.Product?.product);
    if (!product) return res.status(404).json({ message: "Product not found" });
    const quantity = Number(req.body.Product.quantity);
    if (product.quantity < quantity) return res.status(400).json({ message: "Insufficient product quantity" });
    product.quantity -= quantity;
    const order = { _id: id(), ...req.body, totalAmount: Number(req.body.Product.price) * quantity, createdAt: now(), updatedAt: now() };
    store.orders.unshift(order);
    addActivity(store, "Create Order", "Order was created.", "order", order._id, req.body.user || "manager-demo");
    writeStore(store);
    res.status(201).json(populateOrder(store, order));
  });
  router.put("/order/updatestatusOrder/:OrderId", (req, res) => {
    const store = readStore();
    const order = store.orders.find((item) => item._id === req.params.OrderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    Object.assign(order, req.body, { updatedAt: now() });
    writeStore(store);
    res.json({ message: "Order successfully updated", order: populateOrder(store, order) });
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

  router.get("/sales/getallsales", (_req, res) => {
    const store = readStore();
    res.json({ success: true, sales: store.sales.map((sale) => populateSale(store, sale)) });
  });
  router.post("/sales/createsales", (req, res) => {
    const store = readStore();
    const product = store.products.find((item) => item._id === req.body.products?.product);
    if (!product) return res.status(404).json({ message: "Product not found" });
    const quantity = Number(req.body.products.quantity);
    if (product.quantity < quantity) return res.status(400).json({ message: "Insufficient product quantity" });
    product.quantity -= quantity;
    const sale = { _id: id(), ...req.body, totalAmount: quantity * Number(req.body.products.price), createdAt: now(), updatedAt: now() };
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
    const query = String(req.query.query || "").toLowerCase();
    res.json({ sales: store.sales.map((sale) => populateSale(store, sale)).filter((sale) => String(sale.customerName).toLowerCase().includes(query) || String(sale.paymentMethod).toLowerCase().includes(query)) });
  });

  router.post("/pos/checkout", (req, res) => {
    const store = readStore();
    const {
      customerName = "Walk-in Customer",
      cashierId = "manager-demo",
      cashierName = "Demo Cashier",
      items = [],
      paymentMethod,
      discount = 0,
      taxRate = 0,
      taxEnabled = false,
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    if (!paymentMethod) {
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

    const receiptNumber = nextReceiptNo(store);
    let subtotal = 0;
    const receiptItems = [];

    for (const item of items) {
      const product = store.products.find((record) => record._id === item.product);
      const quantity = Number(item.quantity);
      const price = Number(item.price || product.Price || 0);
      const lineTotal = quantity * price;
      subtotal += lineTotal;

      product.quantity = Number(product.quantity) - quantity;
      product.updatedAt = now();

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
        totalAmount: lineTotal,
        discount: 0,
        tax: 0,
        paymentStatus: "paid",
        paymentMethod,
        status: "completed",
        source: "pos",
        createdAt: now(),
        updatedAt: now(),
      };

      store.sales.unshift(sale);

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

    const safeDiscount = Math.min(Number(discount || 0), subtotal);
    const taxableAmount = Math.max(subtotal - safeDiscount, 0);
    const tax = taxEnabled ? taxableAmount * Number(taxRate || 0) : 0;
    const total = taxableAmount + tax;

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
      receipt: {
        receiptNo: receiptNumber,
        customerName,
        cashierName,
        paymentMethod,
        items: receiptItems,
        subtotal,
        discount: safeDiscount,
        tax,
        total,
        createdAt: now(),
      },
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
