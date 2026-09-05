/* The shop's opening set of quick-sell cards.
 *
 *   npm run seed-quick-sell
 *
 * Idempotent: a card that already exists with the same name and price is left
 * exactly as it is, so this can be run again after a deploy without doubling
 * the rail. Nothing is ever deleted — cards the shop has since added by hand
 * survive a re-run untouched.
 *
 * These are ordinary products flagged `nonStock` + `quickSell`. See the notes
 * on both fields in models/Productmodel.js for why a card is a product rather
 * than a row in a table of its own.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../models/Productmodel");
const { ensureMiscCategory } = require("../controller/productController");

// The five the shop asked for, in the order they should appear on the rail.
const CARDS = [
  { name: "Needo Squeezy", Price: 7 },
  { name: "Dubling", Price: 10 },
  { name: "Pod", Price: 5 },
  { name: "Top", Price: 5 },
  { name: "Coil", Price: 5 },
];

const run = async () => {
  const uri = process.env.MONGODB_URL || process.env.MONGO_URL || process.env.MONGO_URI;

  if (!uri) {
    console.error("No MONGODB_URL in the environment — nothing to seed.");
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(uri);
  console.log("connected\n");

  const misc = await ensureMiscCategory();
  let made = 0;
  let kept = 0;

  for (const card of CARDS) {
    const existing = await Product.findOne({
      quickSell: true,
      name: card.name,
      Price: card.Price,
    }).lean();

    if (existing) {
      kept += 1;
      console.log(`  kept   ${card.name.padEnd(16)} ${card.Price}`);
      continue;
    }

    await Product.create({
      name: card.name,
      Price: card.Price,
      Category: misc._id,
      quantity: 0,
      nonStock: true,
      quickSell: true,
      stockCounted: false,
    });

    made += 1;
    console.log(`  added  ${card.name.padEnd(16)} ${card.Price}`);
  }

  const total = await Product.countDocuments({ quickSell: true });
  console.log(`\n${made} added, ${kept} already there. ${total} card(s) on the till.`);

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error("Seeding quick-sell cards failed:", error.message);
  process.exitCode = 1;
  mongoose.disconnect().catch(() => {});
});
