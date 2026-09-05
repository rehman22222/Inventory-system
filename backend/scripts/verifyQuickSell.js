/* Live proof of the quick-sell / non-stock change, end to end.
 *
 * A quick-sell card is an ordinary Product carrying `nonStock`, and that one
 * flag changes what the till's money code does with it in four places:
 *
 *   1. checkout must SELL it without a stock guard — a card has no count, and
 *      the guarded decrement refuses anything it cannot find stock for, so an
 *      unhandled card would fail the sale at the last step in front of a
 *      customer;
 *   2. checkout must not DECREMENT it, and must write no stock movement;
 *   3. a refund must not RESTOCK it — adding a card back would create stock out
 *      of a return, and a €5 coil refunded ten times would leave the catalogue
 *      believing the shop owns ten coils it never had;
 *   4. an ordinary product must be completely unaffected by all of the above.
 *
 * Point 4 is the one that matters most: this touched the single most
 * safety-critical function in the system, and the proof that ordinary stock
 * still behaves has to be part of the same run.
 *
 * Follows verifyPosCredit.js exactly: a uniquely named TEMPORARY database is
 * created on the configured cluster, the real controllers run against it, and
 * only that database is dropped at the end. Nothing in the shop's own data is
 * read or written.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const tempName = `e360_quick_sell_verify_${Date.now()}`;

const withDatabase = (uri, database) => {
  const queryAt = uri.indexOf("?");
  const base = queryAt === -1 ? uri : uri.slice(0, queryAt);
  const query = queryAt === -1 ? "" : uri.slice(queryAt);
  const slash = base.lastIndexOf("/");
  if (slash < "mongodb://".length) throw new Error("MONGODB_URL has no database path");
  return `${base.slice(0, slash + 1)}${database}${query}`;
};

const response = () => {
  const result = { statusCode: 200, body: null };
  return {
    result,
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
};

const request = (body = {}, user = null, params = {}) => ({
  body,
  params,
  query: {},
  ip: "127.0.0.1",
  user,
  app: { get: () => null },
});

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `\n          ${detail}`}`);
};

async function main() {
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not configured");
  process.env.MONGODB_URL = withDatabase(process.env.MONGODB_URL, tempName);
  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 20_000 });

  if (mongoose.connection.name !== tempName) {
    throw new Error(
      `Refusing to run: connected to ${mongoose.connection.name}, not the temp database`,
    );
  }
  console.log(`temporary database: ${mongoose.connection.name}\n`);

  const Store = require("../models/Storemodel");
  const Product = require("../models/Productmodel");
  const Receipt = require("../models/Receiptmodel");
  const Sale = require("../models/Salesmodel");
  const StockTransaction = require("../models/StockTranscationmodel");
  const User = require("../models/Usermodel");
  const pos = require("../controller/posController");
  const products = require("../controller/productController");

  await Store.create({ key: "shop", name: "Quick sell verification shop", currency: "EUR" });
  const cashier = await User.create({
    name: "Verify Cashier",
    email: `verify_qs_${Date.now()}@example.test`,
    password: "not-a-real-password",
    role: "admin",
  });

  /* ── 1. Creating a card through the real endpoint ─────────────────────── */

  const createRes = response();
  await products.createQuickSell(
    request({ name: "Coil", Price: 5 }, cashier),
    createRes,
  );
  check(
    "the create endpoint makes a card",
    createRes.result.statusCode === 201 && createRes.result.body?.card?.name === "Coil",
    `status=${createRes.result.statusCode} body=${JSON.stringify(createRes.result.body)}`,
  );

  const cardId = createRes.result.body?.card?._id;
  const cardDoc = await Product.findById(cardId).lean();
  check(
    "the card is stored nonStock, quickSell and with no barcode",
    cardDoc?.nonStock === true && cardDoc?.quickSell === true && !cardDoc?.barcode,
    `nonStock=${cardDoc?.nonStock} quickSell=${cardDoc?.quickSell} barcode=${cardDoc?.barcode}`,
  );

  // The client cannot smuggle flags in: it sends name and price, nothing else.
  const sneakyRes = response();
  await products.createQuickSell(
    request(
      { name: "Sneaky", Price: 3, nonStock: false, quickSell: false, barcode: "111" },
      cashier,
    ),
    sneakyRes,
  );
  const sneaky = await Product.findById(sneakyRes.result.body?.card?._id).lean();
  check(
    "flags and barcode sent by the client are ignored",
    sneaky?.nonStock === true && sneaky?.quickSell === true && !sneaky?.barcode,
    `nonStock=${sneaky?.nonStock} quickSell=${sneaky?.quickSell} barcode=${sneaky?.barcode}`,
  );

  // Same name and price twice is one card, not two.
  const dupRes = response();
  await products.createQuickSell(request({ name: "Coil", Price: 5 }, cashier), dupRes);
  const coilCount = await Product.countDocuments({ quickSell: true, name: "Coil" });
  check(
    "creating the same card twice does not double the rail",
    dupRes.result.body?.existed === true && coilCount === 1,
    `existed=${dupRes.result.body?.existed} count=${coilCount}`,
  );

  /* ── 2. Selling a card ────────────────────────────────────────────────── */

  const cardSale = response();
  await pos.checkout(
    request(
      {
        customerName: "Walk-in Customer",
        items: [{ product: String(cardId), quantity: 3 }],
        paymentMethod: "cash",
        amountTendered: 15,
      },
      cashier,
    ),
    cardSale,
  );
  check(
    "a card with zero stock still sells",
    cardSale.result.statusCode === 201,
    `status=${cardSale.result.statusCode} body=${JSON.stringify(cardSale.result.body)}`,
  );

  const cardReceiptNo = cardSale.result.body?.receipt?.receiptNo;
  check(
    "the sale is priced from the catalogue, not from the till",
    cardSale.result.body?.receipt?.total === 15,
    `total=${cardSale.result.body?.receipt?.total} (3 x 5 expected)`,
  );

  const cardAfter = await Product.findById(cardId).lean();
  check(
    "selling a card leaves its count untouched",
    cardAfter.quantity === 0,
    `quantity=${cardAfter.quantity} (0 expected)`,
  );

  const cardMovements = await StockTransaction.countDocuments({ product: cardId });
  check(
    "no stock movement is written for a card",
    cardMovements === 0,
    `movements=${cardMovements} (0 expected)`,
  );

  const cardSaleRows = await Sale.find({ receiptNo: cardReceiptNo }).lean();
  check(
    "the card still produces a real, named sale row for the report",
    cardSaleRows.length === 1 &&
      cardSaleRows[0].totalAmount === 15 &&
      String(cardSaleRows[0].products.product) === String(cardId),
    `rows=${cardSaleRows.length} total=${cardSaleRows[0]?.totalAmount}`,
  );

  /* ── 3. Refunding a card ──────────────────────────────────────────────── */

  const refundRes = response();
  await pos.refund(
    request({ receiptNo: cardReceiptNo, items: [], reason: "unwanted" }, cashier),
    refundRes,
  );
  check(
    "a card can be refunded",
    refundRes.result.statusCode === 200,
    `status=${refundRes.result.statusCode} body=${JSON.stringify(refundRes.result.body)}`,
  );

  const cardAfterRefund = await Product.findById(cardId).lean();
  check(
    "refunding a card does NOT create stock",
    cardAfterRefund.quantity === 0,
    `quantity=${cardAfterRefund.quantity} (0 expected — a refund must not invent stock)`,
  );

  const movementsAfterRefund = await StockTransaction.countDocuments({ product: cardId });
  check(
    "still no stock movement after the refund",
    movementsAfterRefund === 0,
    `movements=${movementsAfterRefund} (0 expected)`,
  );

  /* ── 4. An ordinary product is completely unaffected ──────────────────── */

  const normal = await Product.create({
    name: "Ordinary stocked item",
    Price: 4,
    quantity: 10,
    barcode: `QS-NORMAL-${Date.now()}`,
  });

  const normalSale = response();
  await pos.checkout(
    request(
      {
        customerName: "Walk-in Customer",
        items: [{ product: String(normal._id), quantity: 4 }],
        paymentMethod: "cash",
        amountTendered: 16,
      },
      cashier,
    ),
    normalSale,
  );
  const normalAfter = await Product.findById(normal._id).lean();
  check(
    "an ordinary product still decrements on sale",
    normalSale.result.statusCode === 201 && normalAfter.quantity === 6,
    `status=${normalSale.result.statusCode} quantity=${normalAfter.quantity} (6 expected)`,
  );

  const normalMovements = await StockTransaction.countDocuments({
    product: normal._id,
    type: "Stock-out",
  });
  check(
    "an ordinary product still writes its stock movement",
    normalMovements === 1,
    `movements=${normalMovements} (1 expected)`,
  );

  // The guard that stops two tills selling the last unit must still bite.
  const oversell = response();
  await pos.checkout(
    request(
      {
        customerName: "Walk-in Customer",
        items: [{ product: String(normal._id), quantity: 99 }],
        paymentMethod: "cash",
        amountTendered: 400,
      },
      cashier,
    ),
    oversell,
  );
  check(
    "an ordinary product still REFUSES to oversell",
    oversell.result.statusCode >= 400,
    `status=${oversell.result.statusCode} body=${JSON.stringify(oversell.result.body)}`,
  );

  const normalRefund = response();
  await pos.refund(
    request(
      { receiptNo: normalSale.result.body.receipt.receiptNo, items: [], reason: "unwanted" },
      cashier,
    ),
    normalRefund,
  );
  const normalRestocked = await Product.findById(normal._id).lean();
  check(
    "an ordinary product still RESTOCKS on refund",
    normalRestocked.quantity === 10,
    `quantity=${normalRestocked.quantity} (10 expected — back where it started)`,
  );

  /* ── 5. A mixed basket: a card and a stocked item together ────────────── */

  const mixed = await Product.create({
    name: "Mixed basket item",
    Price: 2,
    quantity: 8,
    barcode: `QS-MIX-${Date.now()}`,
  });

  const mixedSale = response();
  await pos.checkout(
    request(
      {
        customerName: "Walk-in Customer",
        items: [
          { product: String(mixed._id), quantity: 2 },
          { product: String(cardId), quantity: 1 },
        ],
        paymentMethod: "cash",
        amountTendered: 20,
      },
      cashier,
    ),
    mixedSale,
  );
  const mixedAfter = await Product.findById(mixed._id).lean();
  const cardAfterMixed = await Product.findById(cardId).lean();
  check(
    "a mixed basket decrements only the counted line",
    mixedSale.result.statusCode === 201 &&
      mixedAfter.quantity === 6 &&
      cardAfterMixed.quantity === 0,
    `status=${mixedSale.result.statusCode} stocked=${mixedAfter.quantity} (6) card=${cardAfterMixed.quantity} (0)`,
  );
  check(
    "the mixed basket totals both lines",
    mixedSale.result.body?.receipt?.total === 9,
    `total=${mixedSale.result.body?.receipt?.total} (2x2 + 1x5 = 9 expected)`,
  );

  /* ── 6. Removing a card ───────────────────────────────────────────────── */

  const listBefore = response();
  await products.listQuickSell(request({}, cashier), listBefore);
  const beforeCount = listBefore.result.body?.cards?.length || 0;

  const removeRes = response();
  await products.removeQuickSell(
    request({}, cashier, { productId: String(sneaky._id) }),
    removeRes,
  );
  const listAfter = response();
  await products.listQuickSell(request({}, cashier), listAfter);
  check(
    "a card can be removed and drops off the list",
    removeRes.result.statusCode === 200 &&
      (listAfter.result.body?.cards?.length || 0) === beforeCount - 1,
    `status=${removeRes.result.statusCode} before=${beforeCount} after=${listAfter.result.body?.cards?.length}`,
  );

  // The remove route must never become a way past RemoveProduct's confirmation.
  const notACard = response();
  await products.removeQuickSell(
    request({}, cashier, { productId: String(normal._id) }),
    notACard,
  );
  const normalSurvives = await Product.findById(normal._id).lean();
  check(
    "the remove route refuses an ordinary product",
    notACard.result.statusCode === 404 && Boolean(normalSurvives),
    `status=${notACard.result.statusCode} stillThere=${Boolean(normalSurvives)}`,
  );

  // Sale rows written against a deleted card survive — the report must not lose
  // history because somebody tidied the rail.
  const historyKept = await Sale.countDocuments({ receiptNo: cardReceiptNo });
  check(
    "sales already rung up survive their card being removed",
    historyKept === 1,
    `rows=${historyKept} (1 expected)`,
  );

  const receipts = await Receipt.countDocuments({});
  console.log(`\n  (${receipts} receipts written during this run)`);

  const failed = checks.filter((c) => !c.ok);
  console.log(
    failed.length
      ? `\nFAIL: ${failed.length} of ${checks.length}`
      : `\nPASS: all ${checks.length} quick-sell checks`,
  );
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Drop ONLY the temporary database, and only if that is what we are on.
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === tempName) {
      await mongoose.connection.dropDatabase();
      console.log(`dropped temporary database: ${tempName}`);
    }
    await mongoose.disconnect();
  });
