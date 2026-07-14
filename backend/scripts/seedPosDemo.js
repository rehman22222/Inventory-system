/**
 * Seeds a realistic vape-shop catalogue so the POS terminal can be exercised
 * end to end: category tiles, scanning, unknown-barcode capture, low stock,
 * discounts, vouchers and refunds.
 *
 *   npm run seed:pos          # add the demo catalogue
 *   npm run seed:pos -- clean # remove everything this script created
 *
 * Everything it creates is tagged, so `clean` removes exactly what it added and
 * nothing else. It writes to whatever MONGODB_URL points at — check your .env
 * before running it against a live database.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/Productmodel");
const Category = require("../models/ Categorymodel");
const Voucher = require("../models/Vouchermodel");

const TAG = "[demo]";

const CATALOGUE = {
  "VAPE": [
    { name: "Lost Mary BM600 Cherry Ice", Price: 7, costPrice: 4.2, quantity: 42, barcode: "6941976612345" },
    { name: "Lost Mary BM6K Blueberry Sour Raspberry", Price: 20, costPrice: 12.5, quantity: 18, barcode: "6941976623456" },
    { name: "Elf Bar 600 Watermelon", Price: 7, costPrice: 4.1, quantity: 30, barcode: "6971802731234" },
    { name: "IVG Pro 10K Classic Menthol", Price: 25, costPrice: 15, quantity: 9 },
    { name: "Elux Legend 20mg Strawberry Kiwi", Price: 7, costPrice: 4, quantity: 24 },
    { name: "Vaporesso Xros 5 Kit", Price: 45, costPrice: 28, quantity: 4 },
  ],
  "SNUS": [
    { name: "Pablo Ice Cold", Price: 7, costPrice: 3.9, quantity: 55, barcode: "7350110000123" },
    { name: "Velo Freezing Peppermint", Price: 7, costPrice: 3.8, quantity: 48 },
    { name: "Killa Cold Mint", Price: 7, costPrice: 3.8, quantity: 12 },
    { name: "Zyn Cool Mint Strong", Price: 8, costPrice: 4.5, quantity: 7 },
  ],
  "DRINKS": [
    { name: "Monster Ultra White 500ml", Price: 2.9, costPrice: 1.6, quantity: 96, barcode: "5060337502191" },
    { name: "Red Bull 250ml", Price: 2.6, costPrice: 1.4, quantity: 72, barcode: "9002490100070" },
    { name: "Coca-Cola Zero 500ml", Price: 2.5, costPrice: 1.2, quantity: 60, barcode: "5449000131836" },
    { name: "Arizona Green Tea", Price: 3.5, costPrice: 1.9, quantity: 25 },
    { name: "Lucozade Original 380ml", Price: 2.45, costPrice: 1.3, quantity: 8 },
  ],
  "CANDY": [
    { name: "Haribo Goldbears 175g", Price: 2.49, costPrice: 1.2, quantity: 40, barcode: "4001686301234" },
    { name: "Skittles Fruits 136g", Price: 2.49, costPrice: 1.15, quantity: 35 },
    { name: "Sour Patch Kids 130g", Price: 3.5, costPrice: 1.8, quantity: 22 },
    { name: "Nerds Gummy Clusters", Price: 3.99, costPrice: 2.1, quantity: 6 },
    { name: "Millions Bubblegum", Price: 1.89, costPrice: 0.9, quantity: 50 },
  ],
  "BAKERY & CONFECTIONERY": [
    { name: "Kinder Bueno", Price: 2.49, costPrice: 1.25, quantity: 44, barcode: "8000500037560" },
    { name: "Dairy Milk Caramel Nibbles", Price: 3.99, costPrice: 2.2, quantity: 16 },
    { name: "Maltesers 37g", Price: 1.49, costPrice: 0.75, quantity: 38 },
    { name: "Reese's 3 Cups", Price: 2.79, costPrice: 1.5, quantity: 3 },
  ],
  "LOOM": [
    { name: "Loom 2ml Blueberry Kush", Price: 45, costPrice: 27, quantity: 14 },
    { name: "Loom 1ml Mango Haze", Price: 30, costPrice: 18, quantity: 21 },
    { name: "Boom Pro 3ml Zkittlez Haze", Price: 60, costPrice: 38, quantity: 5 },
  ],
  "TOBACCO": [
    { name: "Marlboro Gold 20s", Price: 19.5, costPrice: 16.8, quantity: 30, barcode: "4033100120018" },
    { name: "Amber Leaf 30g", Price: 27.8, costPrice: 24.1, quantity: 12 },
    { name: "Rizla Silver Papers", Price: 1, costPrice: 0.45, quantity: 80 },
    { name: "Clipper Lighter", Price: 2.5, costPrice: 0.9, quantity: 2 },
  ],
};

const VOUCHERS = [
  { code: "DEMO10", type: "percent", value: 10, usageLimit: 5 },
  { code: "DEMO5EURO", type: "amount", value: 5, minSpend: 20, usageLimit: 3 },
];

const clean = async () => {
  const categories = await Category.find({ description: { $regex: TAG, $options: "i" } });
  const ids = categories.map((category) => category._id);

  // Delete ONLY the products this script created, by name. Deleting everything
  // in the demo categories would take the shop's own products with it — a
  // category like VAPE fills up with real stock the moment the client starts
  // working.
  const seededNames = Object.values(CATALOGUE)
    .flat()
    .map((item) => item.name);

  const products = await Product.deleteMany({
    name: { $in: seededNames },
    Category: { $in: ids },
  });

  // A category is only removed once nothing is left in it, so a category the
  // client has since filled with real products survives.
  let removedCategories = 0;

  for (const category of categories) {
    const remaining = await Product.countDocuments({ Category: category._id });

    if (remaining === 0) {
      await Category.deleteOne({ _id: category._id });
      removedCategories += 1;
    } else {
      console.log(`kept category ${category.name} — still holds ${remaining} product(s)`);
    }
  }

  const vouchers = await Voucher.deleteMany({ code: { $in: VOUCHERS.map((v) => v.code) } });

  console.log(
    `Removed ${products.deletedCount} demo products, ${removedCategories} categories, ${vouchers.deletedCount} vouchers.`
  );
};

const seed = async () => {
  let createdProducts = 0;
  let skipped = 0;

  for (const [name, items] of Object.entries(CATALOGUE)) {
    let category = await Category.findOne({ name });

    if (!category) {
      category = await Category.create({ name, description: `${TAG} demo category` });
      console.log(`+ category ${name}`);
    }

    for (const item of items) {
      const exists = await Product.findOne({ name: item.name });

      if (exists) {
        skipped += 1;
        continue;
      }

      await Product.create({
        ...item,
        Desciption: item.name, // schema requires it (misspelled field is the contract)
        Category: category._id,
      });
      createdProducts += 1;
    }
  }

  for (const voucher of VOUCHERS) {
    const exists = await Voucher.findOne({ code: voucher.code });
    if (!exists) {
      await Voucher.create(voucher);
      console.log(`+ voucher ${voucher.code}`);
    }
  }

  console.log(`\nSeeded ${createdProducts} products (${skipped} already existed).`);
  console.log("Products WITHOUT a barcode are deliberate — scan any unknown EAN at the");
  console.log("till to try the 'link to existing product' flow.");
};

(async () => {
  if (!process.env.MONGODB_URL) {
    console.error("MONGODB_URL is not set — check backend/.env");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 20000 });
  console.log(`connected to ${mongoose.connection.name}\n`);

  if (process.argv.includes("clean")) {
    await clean();
  } else {
    await seed();
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch((error) => {
  console.error("Seed failed:", error.message);
  process.exit(1);
});
