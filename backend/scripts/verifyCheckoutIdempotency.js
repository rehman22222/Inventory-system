/* Live proof that a sale cannot be rung up twice.
 *
 * The till now stops waiting for the server after about a second and a half and
 * takes the sale locally instead, so the cashier is never left standing on a
 * slow line. That is only safe because of one thing: the request it gave up on
 * may STILL LAND, and when the queued copy syncs afterwards the server has to
 * recognise it as the same sale rather than charging the customer again.
 *
 * Everything below is that one guarantee, from every angle it can be attacked:
 *
 *   - the same clientRef sent twice, one after the other
 *   - the same clientRef sent twice AT ONCE, racing through the unique index
 *   - a sale that timed out online and then arrives through the offline queue
 *   - stock deducted exactly once across all of it
 *   - and, as the control, two DIFFERENT sales still being two sales
 *
 * Follows verifyPosCredit.js: a uniquely named TEMPORARY database, the real
 * controllers, and only that database dropped at the end.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const tempName = `e360_idem_verify_${Date.now()}`;

const withDatabase = (uri, db) => {
  const q = uri.indexOf("?");
  const base = q === -1 ? uri : uri.slice(0, q);
  const query = q === -1 ? "" : uri.slice(q);
  const slash = base.lastIndexOf("/");
  if (slash < "mongodb://".length) throw new Error("MONGODB_URL has no database path");
  return `${base.slice(0, slash + 1)}${db}${query}`;
};

const response = () => {
  const r = { statusCode: 200, body: null };
  return {
    result: r,
    status(c) { r.statusCode = c; return this; },
    json(b) { r.body = b; return this; },
  };
};

const request = (body = {}, user = null) => ({
  body, params: {}, query: {}, ip: "127.0.0.1", user, app: { get: () => null },
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
    throw new Error(`Refusing to run: connected to ${mongoose.connection.name}`);
  }
  console.log(`temporary database: ${mongoose.connection.name}\n`);

  const Store = require("../models/Storemodel");
  const Product = require("../models/Productmodel");
  const Receipt = require("../models/Receiptmodel");
  const Sale = require("../models/Salesmodel");
  const User = require("../models/Usermodel");
  const pos = require("../controller/posController");

  // The unique index on offline.clientRef is what decides the race below, and
  // Mongoose only builds it when it is asked to.
  await Receipt.init();

  await Store.create({ key: "shop", name: "Idempotency shop", currency: "EUR" });
  const cashier = await User.create({
    name: "Verify Cashier",
    email: `idem_${Date.now()}@example.test`,
    password: "x",
    role: "admin",
  });

  const sell = (product, clientRef, quantity = 2) => {
    const res = response();
    return pos
      .checkout(
        request(
          {
            customerName: "Walk-in Customer",
            items: [{ product: String(product._id), quantity }],
            paymentMethod: "cash",
            amountTendered: 100,
            clientRef,
            offlineRef: clientRef ? `OFF-${clientRef.slice(-6).toUpperCase()}` : undefined,
          },
          cashier,
        ),
        res,
      )
      .then(() => res.result);
  };

  /* 1. The same sale, sent twice, one after the other. */

  const p1 = await Product.create({ name: "Idem A", Price: 10, quantity: 20, barcode: `IA-${Date.now()}` });
  const ref1 = "till-abc-0001";

  const first = await sell(p1, ref1);
  const second = await sell(p1, ref1);

  check(
    "the first send completes the sale",
    first.statusCode === 201,
    `status=${first.statusCode} ${JSON.stringify(first.body?.message)}`,
  );
  check(
    "the second send is recognised, not rung up again",
    second.statusCode === 200 && second.body?.duplicate === true,
    `status=${second.statusCode} duplicate=${second.body?.duplicate}`,
  );
  check(
    "both answers name the same receipt",
    first.body?.receipt?.receiptNo === second.body?.receipt?.receiptNo,
    `${first.body?.receipt?.receiptNo} vs ${second.body?.receipt?.receiptNo}`,
  );

  const afterTwice = await Product.findById(p1._id).lean();
  check(
    "stock came off exactly ONCE",
    afterTwice.quantity === 18,
    `quantity=${afterTwice.quantity} (18 expected: 20 less one sale of 2)`,
  );
  check(
    "only one receipt exists for that ref",
    (await Receipt.countDocuments({ "offline.clientRef": ref1 })) === 1,
  );
  check(
    "only one set of sale rows was written",
    (await Sale.countDocuments({ receiptNo: first.body.receipt.receiptNo })) === 1,
  );

  /* 2. The same sale, sent twice AT ONCE. */

  const p2 = await Product.create({ name: "Idem B", Price: 5, quantity: 20, barcode: `IB-${Date.now()}` });
  const ref2 = "till-abc-0002";

  const [raceA, raceB] = await Promise.all([sell(p2, ref2), sell(p2, ref2)]);
  const wins = [raceA, raceB].filter((r) => r.statusCode === 201).length;
  const dupes = [raceA, raceB].filter((r) => r.statusCode === 200 && r.body?.duplicate).length;

  check(
    "racing the same ref: exactly one sale, one duplicate",
    wins === 1 && dupes === 1,
    `created=${wins} duplicate=${dupes} (statuses ${raceA.statusCode}/${raceB.statusCode})`,
  );
  const afterRace = await Product.findById(p2._id).lean();
  check(
    "the race still took stock only once",
    afterRace.quantity === 18,
    `quantity=${afterRace.quantity} (18 expected)`,
  );
  check(
    "the race left exactly one receipt",
    (await Receipt.countDocuments({ "offline.clientRef": ref2 })) === 1,
  );

  /* 3. Timed out online, then synced from the queue. */

  const p3 = await Product.create({ name: "Idem C", Price: 4, quantity: 20, barcode: `IC-${Date.now()}` });
  const ref3 = "till-abc-0003";
  const printed = `OFF-${ref3.slice(-6).toUpperCase()}`;

  // The request the till gave up on, which landed anyway.
  const landed = await sell(p3, ref3, 3);

  // The till, having stopped waiting, queued the same sale and now syncs it.
  const syncRes = response();
  await pos.syncOfflineSales(
    request(
      {
        sales: [
          {
            clientRef: ref3,
            offlineRef: printed,
            soldAt: new Date().toISOString(),
            customerName: "Walk-in Customer",
            items: [{ product: String(p3._id), quantity: 3, price: 4 }],
            payments: [{ method: "cash", amount: 12 }],
          },
        ],
      },
      cashier,
    ),
    syncRes,
  );

  const syncResult = syncRes.result.body?.results?.[0];
  check(
    "the queued copy syncs as a duplicate, not a second sale",
    syncResult?.ok === true && syncResult?.duplicate === true,
    `result=${JSON.stringify(syncResult)}`,
  );
  check(
    "sync points at the receipt the online request already wrote",
    syncResult?.receiptNo === landed.body?.receipt?.receiptNo,
    `${syncResult?.receiptNo} vs ${landed.body?.receipt?.receiptNo}`,
  );
  const afterSync = await Product.findById(p3._id).lean();
  check(
    "the customer was charged once and stock moved once",
    afterSync.quantity === 17,
    `quantity=${afterSync.quantity} (17 expected: 20 less one sale of 3)`,
  );

  /* 4. The printed OFF- ref still finds the sale. */

  const byOfflineRef = await Receipt.findOne({ "offline.ref": printed }).lean();
  check(
    "a slip printed after the timeout is findable for a refund",
    Boolean(byOfflineRef) && byOfflineRef.receiptNo === landed.body.receipt.receiptNo,
    `found=${Boolean(byOfflineRef)} receiptNo=${byOfflineRef?.receiptNo}`,
  );
  check(
    "an online sale is not mislabelled as having come through the queue",
    !byOfflineRef?.offline?.syncedAt,
    `syncedAt=${byOfflineRef?.offline?.syncedAt}`,
  );

  /* 5. The control: different sales are still different sales. */

  const p4 = await Product.create({ name: "Idem D", Price: 3, quantity: 20, barcode: `ID-${Date.now()}` });
  const a = await sell(p4, "till-abc-0004", 1);
  const b = await sell(p4, "till-abc-0005", 1);
  const afterTwo = await Product.findById(p4._id).lean();
  check(
    "two genuinely different sales both go through",
    a.statusCode === 201 &&
      b.statusCode === 201 &&
      a.body.receipt.receiptNo !== b.body.receipt.receiptNo &&
      afterTwo.quantity === 18,
    `${a.body?.receipt?.receiptNo} / ${b.body?.receipt?.receiptNo} quantity=${afterTwo.quantity} (18 expected)`,
  );

  // A till that sends no ref at all (an older build) still sells normally.
  const p5 = await Product.create({ name: "Idem E", Price: 6, quantity: 10, barcode: `IE-${Date.now()}` });
  const noRef = await sell(p5, undefined, 2);
  const afterNoRef = await Product.findById(p5._id).lean();
  check(
    "a sale with no clientRef still works (older till builds)",
    noRef.statusCode === 201 && afterNoRef.quantity === 8,
    `status=${noRef.statusCode} quantity=${afterNoRef.quantity} (8 expected)`,
  );

  const failed = checks.filter((c) => !c.ok);
  console.log(
    failed.length
      ? `\nFAIL: ${failed.length} of ${checks.length}`
      : `\nPASS: all ${checks.length} idempotency checks`,
  );
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === tempName) {
      await mongoose.connection.dropDatabase();
      console.log(`dropped temporary database: ${tempName}`);
    }
    await mongoose.disconnect();
  });
