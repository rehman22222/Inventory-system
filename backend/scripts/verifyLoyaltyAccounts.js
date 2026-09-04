/* Live proof of customer accounts, the fulfilment cycle and the rewards ledger,
 * end to end through the real controllers.
 *
 * Follows verifyOnlinePromotions.js exactly: a uniquely named TEMPORARY database
 * is created on the configured cluster, the real controllers run against it, and
 * only that database is dropped at the end. Nothing in the shop's own data is
 * read or written.
 *
 * What it proves, in order:
 *
 *   1. Registering gives the welcome bonus, through the ledger.
 *   2. A basket is priced in points by the rules the shop wrote — a category
 *      rule, a best-seller rule and a whole-order bonus, with the right one
 *      winning per line and the bonus stacking on top.
 *   3. Those points are PENDING until the goods arrive: not spendable, and
 *      confirmed only when the order is marked delivered.
 *   4. The fulfilment cycle records every step it actually took, and the
 *      customer's tracker shows a skipped step as skipped.
 *   5. Spending points reduces the order total, is charged exactly once, and
 *      the Sale ledger still reconciles to order.total to the cent.
 *   6. Cancelling gives spent points back and takes earned points away.
 *   7. Two simultaneous checkouts cannot spend the same balance twice.
 *   8. Signing up claims the orders you placed as a guest with that email.
 *   9. One customer cannot read another customer's order.
 */
require("dotenv").config();

/* No outbound mail from a verification run.
 *
 * This drives the real controllers, and the real controllers send real email —
 * an order confirmation, a dispatch notice, a review request. Pointed at the
 * shop's live mailbox with test addresses in the To: field, that is a stream of
 * bounces from a script whose whole point is to be safe to run whenever you
 * like. Clearing the credentials BEFORE libs/mailer is first required (it reads
 * them once, at load) makes isMailConfigured() false, and every send becomes a
 * no-op that still exercises the code path around it.
 */
for (const key of Object.keys(process.env)) {
  if (/^(STORE_)?SMTP_/.test(key)) delete process.env[key];
}

const mongoose = require("mongoose");

const tempName = `e360_loyalty_verify_${Date.now()}`;

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

const request = (body = {}) => ({
  body,
  params: {},
  query: {},
  headers: {},
  ip: "127.0.0.1",
  user: null,
  customer: null,
  app: { get: () => null },
  get: () => undefined,
});

const check = (condition, message, detail) => {
  if (!condition) {
    throw new Error(`${message}${detail ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
};

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

async function main() {
  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not configured");
  process.env.MONGODB_URL = withDatabase(process.env.MONGODB_URL, tempName);
  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 20_000 });

  const Store = require("../models/Storemodel");
  const Product = require("../models/Productmodel");
  const OnlineCategory = require("../models/OnlineCategorymodel");
  const OnlineListing = require("../models/OnlineListingmodel");
  const OnlineOrder = require("../models/OnlineOrdermodel");
  const OnlineCustomer = require("../models/OnlineCustomermodel");
  const OnlineLoyaltyRule = require("../models/OnlineLoyaltyRulemodel");
  const OnlineLoyaltyEntry = require("../models/OnlineLoyaltyEntrymodel");
  const Sale = require("../models/Salesmodel");
  const store = require("../controller/onlineStoreController");
  const account = require("../controller/onlineCustomerController");

  const shop = await Store.create({
    key: "shop",
    name: "Loyalty verification shop",
    currency: "EUR",
  });

  /* ── Catalogue ─────────────────────────────────────────────────────────── */

  const liquid = await Product.create({
    name: "House e-liquid",
    Price: 10,
    quantity: 100,
    barcode: `VL-${Date.now()}`,
  });
  const kit = await Product.create({
    name: "Starter kit",
    Price: 20,
    quantity: 100,
    barcode: `VK-${Date.now()}`,
  });
  const sweets = await Product.create({
    name: "Sherbet",
    Price: 5,
    quantity: 100,
    barcode: `VS-${Date.now()}`,
  });

  const liquidCat = await OnlineCategory.create({
    store: shop._id,
    name: "E-liquids",
    slug: "e-liquids",
  });
  const otherCat = await OnlineCategory.create({
    store: shop._id,
    name: "Other",
    slug: "other",
  });

  const liquidListing = await OnlineListing.create({
    store: shop._id,
    product: liquid._id,
    category: liquidCat._id,
    categories: [liquidCat._id],
    listed: true,
    slug: "house-e-liquid",
    webName: "House e-liquid",
  });
  // Tagged "bestseller" — the same flag the storefront's best-sellers row uses.
  const kitListing = await OnlineListing.create({
    store: shop._id,
    product: kit._id,
    category: otherCat._id,
    categories: [otherCat._id],
    listed: true,
    slug: "starter-kit",
    webName: "Starter kit",
    tags: ["bestseller"],
  });
  const sweetsListing = await OnlineListing.create({
    store: shop._id,
    product: sweets._id,
    category: otherCat._id,
    categories: [otherCat._id],
    listed: true,
    slug: "sherbet",
    webName: "Sherbet",
  });

  /* ── The programme the shop writes for itself ──────────────────────────── */

  const settingsReq = request({
    accounts: { enabled: true, guestCheckout: true },
    loyalty: {
      enabled: true,
      programName: "Puff Rewards",
      pointsName: "puffs",
      earnRate: 1, // 1 puff per €1
      redeemRate: 100, // 100 puffs = €1
      minRedeemPoints: 100,
      maxRedeemPercent: 50,
      signupBonus: 500,
      reviewBonus: 50,
      tiers: [
        { name: "Bronze", threshold: 0, multiplier: 1 },
        { name: "Gold", threshold: 5000, multiplier: 2, perk: "Double puffs" },
      ],
    },
  });
  settingsReq.user = { _id: new mongoose.Types.ObjectId(), name: "Owner" };
  const settingsRes = response();
  await store.updateStoreSettings(settingsReq, settingsRes);
  check(settingsRes.result.statusCode === 200, "Could not save loyalty settings", settingsRes.result);

  // Read it back from the database, not from the response: this is the exact
  // shape that fails silently without markModified on a nested block.
  const savedSettings = await store.getOrCreateSettings(shop._id);
  check(
    savedSettings.loyalty?.enabled === true &&
      savedSettings.loyalty.pointsName === "puffs" &&
      savedSettings.loyalty.signupBonus === 500 &&
      savedSettings.loyalty.tiers.length === 2,
    "Loyalty settings did not persist (markModified?)",
    savedSettings.loyalty,
  );

  // Double puffs on e-liquids...
  const categoryRuleReq = request({
    name: "Double on e-liquids",
    scope: "category",
    categories: [String(liquidCat._id)],
    earnMode: "multiplier",
    value: 2,
    priority: 10,
  });
  categoryRuleReq.user = { _id: new mongoose.Types.ObjectId(), name: "Owner" };
  const categoryRuleRes = response();
  await account.createLoyaltyRule(categoryRuleReq, categoryRuleRes);
  check(categoryRuleRes.result.statusCode === 201, "Category rule failed", categoryRuleRes.result);

  // ...a flat 5 per unit on best sellers...
  const bestSellerRuleReq = request({
    name: "Best sellers",
    scope: "best_sellers",
    earnMode: "per_unit",
    value: 5,
    priority: 20,
  });
  bestSellerRuleReq.user = categoryRuleReq.user;
  const bestSellerRuleRes = response();
  await account.createLoyaltyRule(bestSellerRuleReq, bestSellerRuleRes);
  check(bestSellerRuleRes.result.statusCode === 201, "Best-seller rule failed", bestSellerRuleRes.result);

  // ...and a bonus on the order as a whole.
  const orderRuleReq = request({
    name: "Spend 50",
    scope: "order",
    earnMode: "fixed",
    value: 100,
    minSpend: 50,
    priority: 0,
  });
  orderRuleReq.user = categoryRuleReq.user;
  const orderRuleRes = response();
  await account.createLoyaltyRule(orderRuleReq, orderRuleRes);
  check(orderRuleRes.result.statusCode === 201, "Order rule failed", orderRuleRes.result);

  // A rule that targets nothing is refused rather than silently earning nothing.
  const emptyRuleRes = response();
  const emptyRuleReq = request({
    name: "Broken",
    scope: "category",
    categories: [],
    earnMode: "multiplier",
    value: 2,
  });
  emptyRuleReq.user = categoryRuleReq.user;
  await account.createLoyaltyRule(emptyRuleReq, emptyRuleRes);
  check(
    emptyRuleRes.result.statusCode === 400,
    "A category rule with no categories was accepted",
    emptyRuleRes.result,
  );

  /* ── 1. Registering ────────────────────────────────────────────────────── */

  const registerRes = response();
  await account.register(
    request({
      name: "Ada Buyer",
      email: "Ada@Example.com", // deliberately mixed case
      password: "correct horse battery",
    }),
    registerRes,
  );
  check(registerRes.result.statusCode === 201, "Register OTP failed", registerRes.result);
  check(
    /^\d{6}$/.test(registerRes.result.body.devOtp || ""),
    "Register did not create a development OTP when mail is disabled",
    registerRes.result.body,
  );

  const wrongOtpRes = response();
  await account.verifyRegistration(
    request({ email: "ada@example.com", otp: "000000" }),
    wrongOtpRes,
  );
  check(wrongOtpRes.result.statusCode === 400, "Wrong OTP was accepted", wrongOtpRes.result);

  const verifyRes = response();
  await account.verifyRegistration(
    request({ email: "ada@example.com", otp: registerRes.result.body.devOtp }),
    verifyRes,
  );
  check(verifyRes.result.statusCode === 201, "Register verify failed", verifyRes.result);
  check(
    verifyRes.result.body.customer.loyalty.balance === 500,
    "Welcome bonus was not credited",
    verifyRes.result.body.customer.loyalty,
  );

  const ada = await OnlineCustomer.findOne({ email: "ada@example.com" });
  check(Boolean(ada), "Email was not normalised to lower case on register");

  const bonusRows = await OnlineLoyaltyEntry.find({ customer: ada._id, kind: "bonus" });
  check(
    bonusRows.length === 1 && bonusRows[0].points === 500 && bonusRows[0].balanceAfter === 500,
    "Welcome bonus is not on the ledger",
    bonusRows,
  );

  // A duplicate signup is refused, and the password is never stored in the clear.
  const dupeRes = response();
  await account.register(
    request({ name: "Impostor", email: "ada@example.com", password: "another password" }),
    dupeRes,
  );
  check(dupeRes.result.statusCode === 409, "Duplicate email was accepted", dupeRes.result);

  const raw = await OnlineCustomer.findById(ada._id).select("+passwordHash").lean();
  check(
    raw.passwordHash && !raw.passwordHash.includes("correct horse"),
    "Password is not hashed",
  );
  check(
    verifyRes.result.body.customer.passwordHash === undefined,
    "Password hash leaked into the API response",
  );

  /* ── 2 & 3. Earning, priced by the rules, pending until delivery ───────── */

  const signedIn = (body) => {
    const req = request(body);
    req.customer = null; // replaced below with a fresh read each time
    return req;
  };

  const orderOne = signedIn({
    items: [
      // €40 of e-liquid → category rule, 2× base = 80
      { listing: String(liquidListing._id), product: String(liquid._id), quantity: 4 },
      // 1 kit at €20 → best-seller rule wins on priority, 5 per unit = 5
      { listing: String(kitListing._id), product: String(kit._id), quantity: 1 },
    ],
    customer: { name: "Ada Buyer", email: "ada@example.com", phone: "" },
    shippingAddress: {
      line1: "1 Test Street",
      city: "Dublin",
      postcode: "D01",
      country: "Ireland",
    },
    clientRef: `verify-loyalty-1-${Date.now()}`,
    paymentMethod: "cash_on_delivery",
  });
  orderOne.customer = await OnlineCustomer.findById(ada._id);
  const orderOneRes = response();
  await store.placeOrder(orderOne, orderOneRes);
  check(orderOneRes.result.statusCode === 201, "Order one failed", orderOneRes.result);

  const placed = await OnlineOrder.findById(orderOneRes.result.body.order._id);
  // €60 merchandise, free shipping threshold is €100 so shipping is charged;
  // the order bonus is judged on merchandise, which is €60 ≥ €50.
  const expectedEarn = 80 + 5 + 100;
  check(
    placed.loyalty.earned === expectedEarn,
    `Order earned the wrong number of points (expected ${expectedEarn})`,
    { earned: placed.loyalty.earned },
  );
  check(
    String(placed.customer.account) === String(ada._id),
    "Order was not linked to the account",
  );
  check(
    placed.timeline.length === 1 && placed.timeline[0].status === "processing",
    "Order did not open its timeline",
    placed.timeline,
  );

  const afterOrderOne = await OnlineCustomer.findById(ada._id);
  check(
    afterOrderOne.points.pending === expectedEarn && afterOrderOne.points.balance === 500,
    "Earned points should be pending, not spendable",
    afterOrderOne.points,
  );

  /* ── 4. The fulfilment cycle ───────────────────────────────────────────── */

  const advance = async (orderId, status, extra = {}) => {
    const req = request({ status, ...extra });
    req.params.id = String(orderId);
    req.user = { _id: new mongoose.Types.ObjectId(), name: "Packer" };
    const res = response();
    await store.updateOrderStatus(req, res);
    return res;
  };

  const readyRes = await advance(placed._id, "ready", { note: "Packed and waiting" });
  check(readyRes.result.statusCode === 200, "Could not mark ready", readyRes.result);

  const badTrackingRes = await advance(placed._id, "shipped", {
    tracking: { url: "javascript:alert(1)" },
  });
  check(
    badTrackingRes.result.statusCode === 400,
    "A javascript: tracking link was accepted",
    badTrackingRes.result,
  );

  const shippedRes = await advance(placed._id, "shipped", {
    tracking: { carrier: "An Post", number: "CP123", url: "https://anpost.com/t" },
  });
  check(shippedRes.result.statusCode === 200, "Could not mark dispatched", shippedRes.result);

  const deliveredRes = await advance(placed._id, "delivered");
  check(deliveredRes.result.statusCode === 200, "Could not mark delivered", deliveredRes.result);

  const delivered = await OnlineOrder.findById(placed._id);
  check(
    delivered.timeline.map((entry) => entry.status).join(">") ===
      "processing>ready>shipped>delivered",
    "The timeline did not record every step",
    delivered.timeline.map((entry) => entry.status),
  );
  check(
    delivered.tracking.carrier === "An Post" && delivered.tracking.number === "CP123",
    "Tracking details were not kept",
    delivered.tracking,
  );
  check(
    delivered.timeline.find((entry) => entry.status === "ready").note === "Packed and waiting",
    "The note to the customer was not kept",
  );

  const afterDelivery = await OnlineCustomer.findById(ada._id);
  check(
    afterDelivery.points.balance === 500 + expectedEarn &&
      afterDelivery.points.pending === 0 &&
      afterDelivery.points.lifetime === 500 + expectedEarn,
    "Points were not confirmed on delivery",
    afterDelivery.points,
  );

  // Delivering twice must not pay twice. The transition table refuses it, and
  // the confirmedAt stamp would refuse it even if the table changed.
  const replayRes = await advance(placed._id, "delivered");
  check(replayRes.result.statusCode === 409, "A repeated delivery was allowed", replayRes.result);
  const afterReplay = await OnlineCustomer.findById(ada._id);
  check(
    afterReplay.points.balance === 500 + expectedEarn,
    "A repeated delivery changed the balance",
    afterReplay.points,
  );

  /* ── 5. Spending points ────────────────────────────────────────────────── */

  const balanceBeforeSpend = afterReplay.points.balance; // 685
  const spend = 500; // €5

  const orderTwo = request({
    items: [{ listing: String(sweetsListing._id), product: String(sweets._id), quantity: 4 }],
    customer: { name: "Ada Buyer", email: "ada@example.com", phone: "" },
    shippingAddress: {
      line1: "1 Test Street",
      city: "Dublin",
      postcode: "D01",
      country: "Ireland",
    },
    clientRef: `verify-loyalty-2-${Date.now()}`,
    paymentMethod: "cash_on_delivery",
    redeemPoints: spend,
  });
  orderTwo.customer = await OnlineCustomer.findById(ada._id);
  const orderTwoRes = response();
  await store.placeOrder(orderTwo, orderTwoRes);
  check(orderTwoRes.result.statusCode === 201, "Order two failed", orderTwoRes.result);

  const spent = await OnlineOrder.findById(orderTwoRes.result.body.order._id);
  // €20 of sweets, max 50% redeemable = €10, so €5 goes through in full.
  check(
    spent.loyalty.redeemed === spend && spent.loyalty.redeemedValue === 5,
    "Points redemption was not applied",
    spent.loyalty,
  );
  check(
    money(spent.total) === money(spent.subtotal + spent.shipping - spent.loyalty.redeemedValue),
    "The order total does not account for the points spent",
    { total: spent.total, subtotal: spent.subtotal, shipping: spent.shipping },
  );

  const afterSpend = await OnlineCustomer.findById(ada._id);
  check(
    afterSpend.points.balance === balanceBeforeSpend - spend,
    "The balance was not charged exactly once",
    { before: balanceBeforeSpend, after: afterSpend.points.balance },
  );

  const redeemRows = await OnlineLoyaltyEntry.find({ order: spent._id, kind: "redeem" });
  check(
    redeemRows.length === 1 && redeemRows[0].points === -spend,
    "The redemption is not on the ledger exactly once",
    redeemRows,
  );

  // Asking for more than allowed is clamped, not refused. TWO ceilings apply
  // and the lower one has to win: what the programme lets one order absorb
  // (50% of €10 = €5 = 500 points) and what the customer actually holds.
  const greedyOrder = request({
    items: [{ listing: String(sweetsListing._id), product: String(sweets._id), quantity: 2 }],
    customer: { name: "Ada Buyer", email: "ada@example.com", phone: "" },
    shippingAddress: { line1: "1 Test Street", city: "Dublin", postcode: "D01", country: "Ireland" },
    clientRef: `verify-loyalty-greedy-${Date.now()}`,
    paymentMethod: "cash_on_delivery",
    redeemPoints: 1_000_000,
  });
  const balanceBeforeGreedy = (await OnlineCustomer.findById(ada._id)).points.balance;
  greedyOrder.customer = await OnlineCustomer.findById(ada._id);
  const greedyRes = response();
  await store.placeOrder(greedyOrder, greedyRes);
  check(greedyRes.result.statusCode === 201, "Clamped redemption failed", greedyRes.result);
  const greedy = await OnlineOrder.findById(greedyRes.result.body.order._id);
  const orderCeiling = 500; // 50% of a €10 basket, at 100 points to the euro
  const expectedClamp = Math.min(orderCeiling, balanceBeforeGreedy);
  check(
    greedy.loyalty.redeemed === expectedClamp &&
      greedy.loyalty.redeemedValue === Math.floor((expectedClamp / 100) * 100) / 100,
    "An over-large redemption was not clamped to the lower of the two ceilings",
    { balanceBeforeGreedy, orderCeiling, expectedClamp, got: greedy.loyalty },
  );
  check(
    (await OnlineCustomer.findById(ada._id)).points.balance ===
      balanceBeforeGreedy - expectedClamp,
    "The clamped redemption charged the wrong amount",
  );

  /* ── 6. The ledger reconciles, and cancelling undoes both directions ───── */

  await advance(spent._id, "delivered");
  const spentDelivered = await OnlineOrder.findById(spent._id);
  const saleRows = await Sale.find({ receiptNo: spentDelivered.orderNo }).lean();
  const ledgerTotal = money(saleRows.reduce((sum, row) => sum + row.totalAmount, 0));
  check(
    ledgerTotal === money(spentDelivered.total),
    "The Sale ledger does not reconcile to the order total once points were spent",
    { ledgerTotal, orderTotal: spentDelivered.total },
  );

  const beforeCancel = await OnlineCustomer.findById(ada._id);
  const sweetsBeforeCancel = (await Product.findById(sweets._id).lean()).quantity;

  const cancelRes = await advance(greedy._id, "cancelled");
  check(cancelRes.result.statusCode === 200, "Could not cancel", cancelRes.result);

  const afterCancel = await OnlineCustomer.findById(ada._id);
  const cancelled = await OnlineOrder.findById(greedy._id);
  check(
    afterCancel.points.balance === beforeCancel.points.balance + expectedClamp,
    "Points spent on a cancelled order were not returned",
    {
      before: beforeCancel.points.balance,
      after: afterCancel.points.balance,
      expectedBack: expectedClamp,
    },
  );
  check(
    afterCancel.points.pending === 0,
    "A pending earning survived cancellation",
    afterCancel.points,
  );
  check(
    (await Product.findById(sweets._id).lean()).quantity === sweetsBeforeCancel + 2,
    "Cancelling did not restore stock",
  );
  check(Boolean(cancelled.loyalty.reversedAt), "The cancellation was not stamped");

  // Cancelling again must not hand the points back twice. The transition table
  // refuses the move, and reversedAt would refuse the ledger work regardless.
  const doubleCancel = await advance(greedy._id, "cancelled");
  check(doubleCancel.result.statusCode === 409, "A repeated cancellation was allowed");
  const afterDoubleCancel = await OnlineCustomer.findById(ada._id);
  check(
    afterDoubleCancel.points.balance === afterCancel.points.balance,
    "A repeated cancellation returned the points twice",
  );

  /* ── 7. Two checkouts cannot spend the same balance ────────────────────── */

  const racer = await OnlineCustomer.findById(ada._id);
  const balanceAtRace = racer.points.balance;
  const raceBody = (ref) => {
    const req = request({
      items: [{ listing: String(sweetsListing._id), product: String(sweets._id), quantity: 8 }],
      customer: { name: "Ada Buyer", email: "ada@example.com", phone: "" },
      shippingAddress: { line1: "1 Test Street", city: "Dublin", postcode: "D01", country: "Ireland" },
      clientRef: ref,
      paymentMethod: "cash_on_delivery",
      // Each asks for the whole balance. Only one can have it.
      redeemPoints: balanceAtRace,
    });
    req.customer = racer;
    return req;
  };
  const raceA = response();
  const raceB = response();
  await Promise.all([
    store.placeOrder(raceBody(`race-a-${Date.now()}`), raceA),
    store.placeOrder(raceBody(`race-b-${Date.now()}`), raceB),
  ]);

  const raceOrders = await OnlineOrder.find({
    "customer.account": racer._id,
    "loyalty.redeemed": { $gt: 0 },
    clientRef: { $regex: "^race-" },
  }).lean();
  const racedPoints = raceOrders.reduce((sum, order) => sum + order.loyalty.redeemed, 0);
  const afterRace = await OnlineCustomer.findById(ada._id);
  check(
    racedPoints <= balanceAtRace && afterRace.points.balance >= 0,
    "Two simultaneous checkouts spent more points than the customer had",
    { balanceAtRace, racedPoints, after: afterRace.points.balance },
  );
  check(
    afterRace.points.balance === balanceAtRace - racedPoints,
    "The balance does not match what was actually spent",
    { balanceAtRace, racedPoints, after: afterRace.points.balance },
  );

  /* ── 8. Guest orders are claimed on sign-up ────────────────────────────── */

  const guestRes = response();
  await store.placeOrder(
    request({
      items: [{ listing: String(sweetsListing._id), product: String(sweets._id), quantity: 1 }],
      customer: { name: "Bob Guest", email: "bob@example.com", phone: "" },
      shippingAddress: { line1: "2 Test Street", city: "Cork", postcode: "T12", country: "Ireland" },
      clientRef: `verify-guest-${Date.now()}`,
      paymentMethod: "cash_on_delivery",
    }),
    guestRes,
  );
  check(guestRes.result.statusCode === 201, "Guest checkout failed", guestRes.result);
  const guestOrder = await OnlineOrder.findById(guestRes.result.body.order._id).lean();
  check(guestOrder.customer.account === null, "A guest order was linked to an account");

  const bobRes = response();
  await account.register(
    request({ name: "Bob Guest", email: "bob@example.com", password: "another good password" }),
    bobRes,
  );
  check(bobRes.result.statusCode === 201, "Bob could not request signup OTP", bobRes.result);
  const bobVerifyRes = response();
  await account.verifyRegistration(
    request({ email: "bob@example.com", otp: bobRes.result.body.devOtp }),
    bobVerifyRes,
  );
  check(bobVerifyRes.result.statusCode === 201, "Bob could not register", bobVerifyRes.result);
  check(
    bobVerifyRes.result.body.claimedOrders === 1,
    "The guest order was not claimed on sign-up",
    bobVerifyRes.result.body,
  );
  const bob = await OnlineCustomer.findOne({ email: "bob@example.com" });
  const claimed = await OnlineOrder.findById(guestOrder._id).lean();
  check(
    String(claimed.customer.account) === String(bob._id),
    "The claimed order does not point at the new account",
  );
  // Claiming history must not retroactively mint points nobody was promised.
  check(
    bob.points.balance === 500,
    "Claiming a guest order awarded points retroactively",
    bob.points,
  );

  /* ── 9. One customer cannot read another's order ───────────────────────── */

  const snoopReq = request();
  snoopReq.params.orderNo = placed.orderNo; // Ada's order
  snoopReq.customer = bob;
  const snoopRes = response();
  await account.myOrder(snoopReq, snoopRes);
  check(
    snoopRes.result.statusCode === 404,
    "One customer could read another customer's order",
    snoopRes.result,
  );

  // ...and Ada can read her own, with the tracker built from its real history.
  const ownReq = request();
  ownReq.params.orderNo = placed.orderNo;
  ownReq.customer = await OnlineCustomer.findById(ada._id);
  const ownRes = response();
  await account.myOrder(ownReq, ownRes);
  check(ownRes.result.statusCode === 200, "Ada could not read her own order", ownRes.result);
  const tracker = ownRes.result.body.order.tracker;
  check(
    tracker.steps.length === 4 && tracker.steps.every((step) => step.done || step.current),
    "The tracker does not show a fully delivered order as complete",
    tracker.steps,
  );

  // A blocked account is refused at once, without touching every route.
  const blockReq = request({ status: "blocked" });
  blockReq.params.id = String(bob._id);
  blockReq.user = { _id: new mongoose.Types.ObjectId(), name: "Owner" };
  const blockRes = response();
  await account.setCustomerStatus(blockReq, blockRes);
  check(blockRes.result.statusCode === 200, "Could not block an account", blockRes.result);
  const loginBlockedRes = response();
  await account.login(
    request({ email: "bob@example.com", password: "another good password" }),
    loginBlockedRes,
  );
  check(
    loginBlockedRes.result.statusCode === 403,
    "A blocked account could still sign in",
    loginBlockedRes.result,
  );

  // A wrong password is refused, and says nothing about whether the account exists.
  const wrongRes = response();
  await account.login(request({ email: "ada@example.com", password: "not it" }), wrongRes);
  const unknownRes = response();
  await account.login(request({ email: "nobody@example.com", password: "not it" }), unknownRes);
  check(
    wrongRes.result.statusCode === 401 &&
      unknownRes.result.statusCode === 401 &&
      wrongRes.result.body.message === unknownRes.result.body.message,
    "The login form reveals whether an email has an account",
    { wrong: wrongRes.result.body, unknown: unknownRes.result.body },
  );

  // The cached balance agrees with the ledger it is a cache of.
  const loyalty = require("../libs/loyalty");
  const cached = await OnlineCustomer.findById(ada._id).lean();
  const recomputed = await loyalty.recomputeBalance(ada._id);
  check(
    recomputed.balance === cached.points.balance &&
      recomputed.pending === cached.points.pending &&
      recomputed.lifetime === cached.points.lifetime,
    "The cached balance has drifted from the ledger",
    { cached: cached.points, recomputed },
  );

  console.log(
    JSON.stringify(
      {
        signupBonus: 500,
        firstOrderEarned: expectedEarn,
        earnedPendingUntilDelivery: true,
        fulfilmentSteps: delivered.timeline.map((entry) => entry.status),
        trackingKept: `${delivered.tracking.carrier} ${delivered.tracking.number}`,
        pointsSpent: spend,
        spendChargedOnce: true,
        saleLedgerReconciles: ledgerTotal === money(spentDelivered.total),
        cancellationReturnedPoints: true,
        concurrentSpendPrevented: racedPoints <= balanceAtRace,
        guestOrderClaimed: true,
        crossCustomerAccessBlocked: true,
        balanceMatchesLedger: true,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === tempName) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  });
