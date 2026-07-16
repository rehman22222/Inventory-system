const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
require("dotenv").config();

const User = require("../models/Usermodel");
const Category = require("../models/ Categorymodel");
const Supplier = require("../models/Suppliermodel");
const Product = require("../models/Productmodel");
const Order = require("../models/Ordermodel");
const Sale = require("../models/Salesmodel");
const StockTransaction = require("../models/StockTranscationmodel");
const Notification = require("../models/Notificationmodel");
const ActivityLog = require("../models/ActivityLogmodel");

const demoUsers = [
  { name: "Demo Admin", email: "admin@example.com", password: "Admin@123", role: "admin" },
  { name: "Demo Manager", email: "manager@example.com", password: "Manager@123", role: "manager" },
  { name: "Demo Staff", email: "staff@example.com", password: "Staff@123", role: "staff" },
];

const categorySeeds = [
  { key: "devices", name: "Devices", description: "Reusable and rechargeable vape devices" },
  { key: "liquids", name: "E-Liquids", description: "Bottled liquids and flavor refills" },
  { key: "pods", name: "Pods", description: "Replacement pods and cartridges" },
  { key: "disposables", name: "Disposables", description: "Single-use inventory items" },
  { key: "accessories", name: "Accessories", description: "Chargers, cases, coils, and support items" },
];

const supplierSeeds = [
  {
    key: "northline",
    name: "Northline Distribution",
    contactInfo: {
      phone: "555-0142",
      email: "orders@northline.example",
      address: "1840 Harbor Road, Los Angeles, CA",
    },
  },
  {
    key: "cloudnine",
    name: "CloudNine Wholesale",
    contactInfo: {
      phone: "555-0177",
      email: "supply@cloudnine.example",
      address: "72 Market Street, San Diego, CA",
    },
  },
  {
    key: "pacific",
    name: "Pacific Vape Supply",
    contactInfo: {
      phone: "555-0188",
      email: "sales@pacificvape.example",
      address: "404 Commerce Drive, Irvine, CA",
    },
  },
];

const productSeeds = [
  {
    key: "vaporx",
    barcode: "6291107451234",
    name: "VaporX Pro Kit",
    Desciption: "Premium rechargeable starter kit",
    category: "devices",
    supplier: "northline",
    Price: 59.99,
    quantity: 42,
  },
  {
    key: "slimpen",
    barcode: "6291107451235",
    name: "Slim Pen Device",
    Desciption: "Compact entry-level rechargeable device",
    category: "devices",
    supplier: "northline",
    Price: 34.99,
    quantity: 18,
  },
  {
    key: "mint",
    barcode: "6291107451236",
    name: "Arctic Mint 30ml",
    Desciption: "Cool mint e-liquid bottle",
    category: "liquids",
    supplier: "cloudnine",
    Price: 15.99,
    quantity: 86,
  },
  {
    key: "mango",
    barcode: "6291107451237",
    name: "Mango Ice 30ml",
    Desciption: "Fruit blend e-liquid with cool finish",
    category: "liquids",
    supplier: "cloudnine",
    Price: 16.99,
    quantity: 64,
  },
  {
    key: "pods",
    barcode: "6291107451238",
    name: "Replacement Pod Pack",
    Desciption: "Three-pack replacement pods",
    category: "pods",
    supplier: "pacific",
    Price: 12.99,
    quantity: 31,
  },
  {
    key: "disposable",
    barcode: "6291107451239",
    name: "Nova Disposable Blueberry",
    Desciption: "Single-use blueberry disposable unit",
    category: "disposables",
    supplier: "pacific",
    Price: 19.99,
    quantity: 9,
  },
  {
    key: "coils",
    barcode: "6291107451240",
    name: "Mesh Coil 5-Pack",
    Desciption: "Replacement mesh coils",
    category: "accessories",
    supplier: "pacific",
    Price: 11.49,
    quantity: 54,
  },
  {
    key: "charger",
    barcode: "6291107451241",
    name: "USB-C Fast Charger",
    Desciption: "Certified USB-C charging cable",
    category: "accessories",
    supplier: "northline",
    Price: 8.99,
    quantity: 73,
  },
];

async function upsertUsers() {
  const users = {};

  for (const user of demoUsers) {
    const password = await bcrypt.hash(user.password, 10);
    const doc = await User.findOneAndUpdate(
      { email: user.email },
      { ...user, password, ProfilePic: "" },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    users[user.role] = doc;
    console.log(`Seeded ${user.role}: ${user.email} / ${user.password}`);
  }

  return users;
}

async function upsertCategories() {
  const categories = {};

  for (const category of categorySeeds) {
    const doc = await Category.findOneAndUpdate(
      { name: category.name },
      { name: category.name, description: category.description },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    categories[category.key] = doc;
  }

  return categories;
}

async function upsertSuppliers() {
  const suppliers = {};

  for (const supplier of supplierSeeds) {
    const doc = await Supplier.findOneAndUpdate(
      { name: supplier.name },
      { name: supplier.name, contactInfo: supplier.contactInfo },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    suppliers[supplier.key] = doc;
  }

  return suppliers;
}

async function upsertProducts(categories, suppliers) {
  const products = {};

  for (const product of productSeeds) {
    const doc = await Product.findOneAndUpdate(
      { barcode: product.barcode },
      {
        name: product.name,
        barcode: product.barcode,
        Desciption: product.Desciption,
        Category: categories[product.category]._id,
        supplier: suppliers[product.supplier]._id,
        Price: product.Price,
        quantity: product.quantity,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    products[product.key] = doc;
  }

  await Supplier.findByIdAndUpdate(suppliers.northline._id, { productsSupplied: products.vaporx._id });
  await Supplier.findByIdAndUpdate(suppliers.cloudnine._id, { productsSupplied: products.mint._id });
  await Supplier.findByIdAndUpdate(suppliers.pacific._id, { productsSupplied: products.pods._id });

  return products;
}

async function upsertOperations(users, products, suppliers) {
  await Order.findOneAndUpdate(
    { Description: "Online order for starter kit bundle" },
    {
      user: users.manager._id,
      Description: "Online order for starter kit bundle",
      Product: { product: products.vaporx._id, quantity: 2, price: 59.99 },
      totalAmount: 119.98,
      status: "delivered",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await Order.findOneAndUpdate(
    { Description: "Replacement pods for VIP customer" },
    {
      user: users.staff._id,
      Description: "Replacement pods for VIP customer",
      Product: { product: products.pods._id, quantity: 3, price: 12.99 },
      totalAmount: 38.97,
      status: "pending",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const saleSeeds = [
    ["POS-DEMO-0001", "Jordan Lee", products.vaporx, 1, 59.99, "creditcard"],
    ["POS-DEMO-0002", "Avery Smith", products.mango, 3, 16.99, "cash"],
    ["POS-DEMO-0003", "Taylor Morgan", products.pods, 2, 12.99, "wallet"],
  ];

  for (const [receiptNo, customerName, product, quantity, price, paymentMethod] of saleSeeds) {
    await Sale.findOneAndUpdate(
      { receiptNo },
      {
        receiptNo,
        customerName,
        cashier: users.staff._id,
        cashierName: users.staff.name,
        products: { product: product._id, quantity, price },
        totalAmount: quantity * price,
        discount: 0,
        tax: 0,
        paymentStatus: "paid",
        paymentMethod,
        status: "completed",
        source: "pos",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const stockSeeds = [
    [products.vaporx, "Stock-in", 50, suppliers.northline, "OPENING-STOCK"],
    [products.mint, "Stock-in", 120, suppliers.cloudnine, "OPENING-STOCK"],
    [products.pods, "Stock-in", 75, suppliers.pacific, "OPENING-STOCK"],
    [products.disposable, "Stock-out", 21, suppliers.pacific, "POS-DEMO-0003"],
  ];

  for (const [product, type, quantity, supplier, reference] of stockSeeds) {
    await StockTransaction.findOneAndUpdate(
      { product: product._id, type, reference },
      { product: product._id, type, quantity, supplier: supplier._id, reference },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  await Notification.findOneAndUpdate(
    { name: "Low stock alert", type: /Nova Disposable Blueberry/ },
    {
      name: "Low stock alert",
      type: "Nova Disposable Blueberry is below the reorder threshold.",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await ActivityLog.findOneAndUpdate(
    { action: "POS Checkout", description: "Demo POS receipt POS-DEMO-0001 completed." },
    {
      action: "POS Checkout",
      description: "Demo POS receipt POS-DEMO-0001 completed.",
      entity: "order",
      userId: users.staff._id,
      ipAddress: "::1",
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function main() {
  if (!process.env.MONGODB_URL) {
    throw new Error("MONGODB_URL is missing in backend/.env");
  }

  await mongoose.connect(process.env.MONGODB_URL);
  console.log("Connected to MongoDB Atlas");

  const users = await upsertUsers();
  const categories = await upsertCategories();
  const suppliers = await upsertSuppliers();
  const products = await upsertProducts(categories, suppliers);
  await upsertOperations(users, products, suppliers);

  await mongoose.disconnect();
  console.log("Mongo demo data is ready.");
}

main().catch(async (error) => {
  console.error("Mongo seed failed:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
