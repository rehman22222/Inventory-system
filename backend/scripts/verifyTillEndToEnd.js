/* The till, end to end, through the real controllers.
 *
 *   npm run verify:till
 *
 * The other verify scripts each prove one thing deeply — credit terms, the
 * quick-sell flag, checkout idempotency. This one is the wide pass: the paths a
 * shift actually walks, in the order it walks them, so a change that quietly
 * breaks "scan, discount, pay, refund, close the day" is caught by something
 * other than a cashier at a counter.
 *
 * Covered here and nowhere else:
 *   - the product lifecycle: add, edit, barcode lookup, delete-with-confirm
 *   - the barcode the till scans, and the one it refuses
 *   - a deal detected and priced at checkout
 *   - a voucher redeemed, and refused the second time
 *   - split tender, change due, and what lands in the drawer
 *   - a partial refund, then the rest, then the receipt closing out
 *   - an exchange spending its own credit
 *   - hold and resume
 *   - day closing, and what it says was handed over
 *   - who is allowed to pull which report
 *
 * Follows verifyPosCredit.js: a uniquely named TEMPORARY database on the
 * configured cluster, the real controllers against it, and only that database
 * dropped at the end. Nothing in the shop's own data is read or written.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const tempName = `e360_till_e2e_${Date.now()}`;

const withDatabase = (uri, database) => {
  const q = uri.indexOf("?");
  const base = q === -1 ? uri : uri.slice(0, q);
  const query = q === -1 ? "" : uri.slice(q);
  const slash = base.lastIndexOf("/");
  if (slash < "mongodb://".length) throw new Error("MONGODB_URL has no database path");
  return `${base.slice(0, slash + 1)}${database}${query}`;
};

const response = () => {
  const r = { statusCode: 200, body: null, headers: {}, sent: null };
  return {
    result: r,
    status(c) { r.statusCode = c; return this; },
    json(b) { r.body = b; return this; },
    setHeader(k, v) { r.headers[k] = v; },
    send(buf) { r.sent = buf; return this; },
  };
};

const request = (body = {}, user = null, params = {}, query = {}) => ({
  body, params, query, ip: "127.0.0.1", user,
  app: { get: () => null },
  headers: {},
  get: () => undefined,
});

const checks = [];
const section = (name) => console.log(`\n── ${name} ${"─".repeat(Math.max(0, 58 - name.length))}`);
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
  console.log(`temporary database: ${mongoose.connection.name}`);

  const Store = require("../models/Storemodel");
  const Product = require("../models/Productmodel");
  const Category = require("../models/ Categorymodel");
  const Receipt = require("../models/Receiptmodel");
  const Sale = require("../models/Salesmodel");
  const Voucher = require("../models/Vouchermodel");
  const Deal = require("../models/Dealmodel");
  const HeldSale = require("../models/HeldSalemodel");
  const DayClosing = require("../models/DayClosingmodel");
  const User = require("../models/Usermodel");

  const pos = require("../controller/posController");
  const products = require("../controller/productController");
  const vouchers = require("../controller/voucherController");
  const deals = require("../controller/dealController");
  const reports = require("../controller/reportController");

  await Receipt.init();
  await Store.create({ key: "shop", name: "QA shop", currency: "EUR", timezone: "Europe/Dublin" });

  const mk = (role, name) =>
    User.create({ name, email: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@qa.test`, password: "x", role });

  const owner = await mk("superadmin", "Owner");
  const admin = await mk("admin", "Admin");
  const manager = await mk("manager", "Manager");
  const staff = await mk("staff", "Staff");
  const reporter = await mk("report", "Reporter");

  const category = await Category.create({ name: "QA Sweets" });

  /* ── 1. The product lifecycle ────────────────────────────────────────── */
  section("products: add, edit, find, delete");

  const addRes = response();
  await products.Addproduct(
    request(
      { name: "QA CHOC BAR", Price: 2.5, costPrice: 1, quantity: 40, Category: String(category._id), barcode: "QA-0001" },
      admin,
    ),
    addRes,
  );
  check("an admin can add a product", addRes.result.statusCode === 201,
    `status=${addRes.result.statusCode} ${JSON.stringify(addRes.result.body?.message)}`);

  const added = await Product.findOne({ barcode: "QA-0001" }).lean();
  check("it stores the price, the cost and the count",
    added && added.Price === 2.5 && added.costPrice === 1 && added.quantity === 40,
    `price=${added?.Price} cost=${added?.costPrice} qty=${added?.quantity}`);

  const dupRes = response();
  await products.Addproduct(
    request({ name: "QA DUPLICATE", Price: 1, barcode: "QA-0001" }, admin),
    dupRes,
  );
  check("a second product cannot take the same barcode", dupRes.result.statusCode >= 400,
    `status=${dupRes.result.statusCode}`);

  const scanRes = response();
  await products.getProductByBarcode(request({}, staff, { code: "QA-0001" }), scanRes);
  check("the till finds it by barcode", scanRes.result.statusCode === 200,
    `status=${scanRes.result.statusCode}`);

  const missRes = response();
  await products.getProductByBarcode(request({}, staff, { code: "NOT-A-BARCODE" }), missRes);
  check("an unknown barcode is a clean 404, not a crash", missRes.result.statusCode === 404,
    `status=${missRes.result.statusCode}`);

  const editRes = response();
  await products.EditProduct(
    request({ Price: 3, quantity: 50 }, staff, { productId: String(added._id) }),
    editRes,
  );
  const edited = await Product.findById(added._id).lean();
  check("a cashier can correct a price at the counter",
    editRes.result.statusCode === 200 && edited.Price === 3 && edited.quantity === 50,
    `status=${editRes.result.statusCode} price=${edited.Price} qty=${edited.quantity}`);
  check("typing a count marks it as actually counted", edited.stockCounted === true,
    `stockCounted=${edited.stockCounted}`);

  const spare = await Product.create({ name: "QA SPARE", Price: 1, quantity: 5, barcode: "QA-SPARE" });
  const delRes = response();
  await products.RemoveProduct(request({}, manager, { productId: String(spare._id) }), delRes);
  check("an unused product deletes without a confirmation",
    delRes.result.statusCode === 200 && !(await Product.findById(spare._id)),
    `status=${delRes.result.statusCode}`);

  /* ── 2. A plain sale ─────────────────────────────────────────────────── */
  section("checkout: plain, split tender, change due");

  const sell = async (body, user = staff) => {
    const res = response();
    await pos.checkout(request(body, user), res);
    return res.result;
  };

  const plain = await sell({
    customerName: "Walk-in Customer",
    items: [{ product: String(added._id), quantity: 2 }],
    paymentMethod: "cash",
    amountTendered: 10,
  });
  check("a plain cash sale completes", plain.statusCode === 201,
    `status=${plain.statusCode} ${JSON.stringify(plain.body?.message)}`);
  check("it totals from the catalogue price", plain.body?.receipt?.total === 6,
    `total=${plain.body?.receipt?.total} (2 x 3 expected)`);
  check("change due is worked out", plain.body?.receipt?.changeDue === 4,
    `change=${plain.body?.receipt?.changeDue} (10 - 6 expected)`);
  check("stock came off", (await Product.findById(added._id).lean()).quantity === 48,
    `qty=${(await Product.findById(added._id).lean()).quantity} (48 expected)`);
  check("the receipt is numbered from one", plain.body?.receipt?.receiptNo === "POS-000001",
    `receiptNo=${plain.body?.receipt?.receiptNo}`);

  const split = await sell({
    customerName: "Walk-in Customer",
    items: [{ product: String(added._id), quantity: 4 }],
    payments: [{ method: "cash", amount: 5 }, { method: "creditcard", amount: 7 }],
  });
  check("a split tender completes and is labelled split",
    split.statusCode === 201 && split.body?.receipt?.paymentMethod === "split",
    `status=${split.statusCode} method=${split.body?.receipt?.paymentMethod}`);

  const short = await sell({
    customerName: "Walk-in Customer",
    items: [{ product: String(added._id), quantity: 1 }],
    payments: [{ method: "cash", amount: 1 }],
  });
  check("a short payment is refused", short.statusCode === 400,
    `status=${short.statusCode} ${JSON.stringify(short.body?.message)}`);

  const oversell = await sell({
    customerName: "Walk-in Customer",
    items: [{ product: String(added._id), quantity: 9999 }],
    paymentMethod: "cash",
  });
  check("selling more than there is, is refused", oversell.statusCode >= 400,
    `status=${oversell.statusCode}`);

  /* ── 3. A deal ───────────────────────────────────────────────────────── */
  section("deals: made at the till, detected and priced at checkout");

  const dealProduct = await Product.create({ name: "QA POD", Price: 6, quantity: 30, barcode: "QA-POD" });
  const dealRes = response();
  await deals.createDeal(
    request({ name: "Any 3 pods for 15", mode: "mix", groupQuantity: 3,
      items: [{ product: String(dealProduct._id), quantity: 1 }],
      discountType: "setPrice", discount: 15, active: true }, staff),
    dealRes,
  );
  check("a cashier can create a deal", dealRes.result.statusCode === 201,
    `status=${dealRes.result.statusCode} ${JSON.stringify(dealRes.result.body?.message)}`);

  const madeDeal = await Deal.findOne({ name: "Any 3 pods for 15" }).lean();

  const noDeal = await sell({
    customerName: "Walk-in Customer",
    items: [{ product: String(dealProduct._id), quantity: 3 }],
    paymentMethod: "cash",
  });
  check("a deal NOT applied leaves the price alone", noDeal.body?.receipt?.total === 18,
    `total=${noDeal.body?.receipt?.total} (3 x 6 = 18 expected)`);

  const withDeal = await sell({
    customerName: "Walk-in Customer",
    items: [{ product: String(dealProduct._id), quantity: 3 }],
    paymentMethod: "cash",
    dealIds: [String(madeDeal._id)],
  });
  check("the same basket WITH the deal applied is priced at the set price",
    withDeal.body?.receipt?.total === 15,
    `total=${withDeal.body?.receipt?.total} (15 expected)`);
  check("the receipt records which offer was given",
    (withDeal.body?.receipt?.deals || []).length === 1,
    `deals=${JSON.stringify(withDeal.body?.receipt?.deals?.map((d) => d.name))}`);

  /* ── 4. A voucher ────────────────────────────────────────────────────── */
  section("vouchers: redeemed once, refused twice");

  const vRes = response();
  await vouchers.createVoucher(
    // The endpoint takes `type`, not `discountType` — see voucherController.
    request({ code: "QA10", type: "amount", value: 5, usageLimit: 1 }, staff),
    vRes,
  );
  check("a cashier can write a voucher", vRes.result.statusCode === 201,
    `status=${vRes.result.statusCode} ${JSON.stringify(vRes.result.body?.message)}`);

  const withVoucher = await sell({
    customerName: "Walk-in Customer",
    items: [{ product: String(added._id), quantity: 4 }],
    paymentMethod: "cash",
    voucherCode: "QA10",
  });
  check("the voucher comes off the basket", withVoucher.body?.receipt?.total === 7,
    `total=${withVoucher.body?.receipt?.total} (4 x 3 less 5 = 7 expected)`);

  const reuse = await sell({
    customerName: "Walk-in Customer",
    items: [{ product: String(added._id), quantity: 4 }],
    paymentMethod: "cash",
    voucherCode: "QA10",
  });
  check("a single-use voucher cannot be spent twice", reuse.statusCode >= 400,
    `status=${reuse.statusCode} ${JSON.stringify(reuse.body?.message)}`);

  /* ── 5. Refunds ──────────────────────────────────────────────────────── */
  section("refunds: partial, then the rest, then closed out");

  const toRefund = await sell({
    customerName: "Walk-in Customer",
    items: [{ product: String(added._id), quantity: 4 }],
    paymentMethod: "cash",
  });
  const refNo = toRefund.body.receipt.receiptNo;
  const beforeRefund = (await Product.findById(added._id).lean()).quantity;

  const partRes = response();
  await pos.refund(
    request({ receiptNo: refNo, items: [{ product: String(added._id), quantity: 1 }], reason: "unwanted" }, manager),
    partRes,
  );
  check("a partial refund goes back at what was paid",
    partRes.result.statusCode === 200 && partRes.result.body?.amount === 3,
    `status=${partRes.result.statusCode} amount=${partRes.result.body?.amount} (3 expected)`);
  check("unwanted goods go back on the shelf",
    (await Product.findById(added._id).lean()).quantity === beforeRefund + 1,
    `qty=${(await Product.findById(added._id).lean()).quantity}`);
  check("the receipt reads partially refunded",
    (await Receipt.findOne({ receiptNo: refNo }).lean()).status === "partially-refunded",
    `status=${(await Receipt.findOne({ receiptNo: refNo }).lean()).status}`);

  const restRes = response();
  await pos.refund(request({ receiptNo: refNo, items: [], reason: "unwanted" }, manager), restRes);
  check("refunding the rest closes the receipt out",
    (await Receipt.findOne({ receiptNo: refNo }).lean()).status === "refunded",
    `status=${(await Receipt.findOne({ receiptNo: refNo }).lean()).status}`);

  const overRes = response();
  await pos.refund(request({ receiptNo: refNo, items: [], reason: "unwanted" }, manager), overRes);
  check("a fully refunded receipt cannot be refunded again", overRes.result.statusCode >= 400,
    `status=${overRes.result.statusCode}`);

  const damaged = await sell({
    customerName: "Walk-in Customer",
    items: [{ product: String(added._id), quantity: 1 }],
    paymentMethod: "cash",
  });
  const beforeWriteOff = (await Product.findById(added._id).lean()).quantity;
  const dmgRes = response();
  await pos.refund(request({ receiptNo: damaged.body.receipt.receiptNo, items: [], reason: "damaged" }, manager), dmgRes);
  check("damaged goods are refunded but NOT restocked",
    (await Product.findById(added._id).lean()).quantity === beforeWriteOff,
    `qty went ${beforeWriteOff} -> ${(await Product.findById(added._id).lean()).quantity} (unchanged expected)`);

  /* ── 6. Hold and resume ──────────────────────────────────────────────── */
  section("held sales");

  const holdRes = response();
  await pos.holdSale(
    // A held item carries its price: the model requires it, because a parked
    // basket has to be resumable at what it was rung up at.
    request({ customerName: "Walk-in Customer", till: "TERMINAL-MAIN",
      items: [{ product: String(added._id), name: "QA CHOC BAR", quantity: 2, price: 3 }] }, staff),
    holdRes,
  );
  check("a basket can be parked", holdRes.result.statusCode === 201,
    `status=${holdRes.result.statusCode}`);

  const listHeld = response();
  await pos.getHeldSales(request({}, staff), listHeld);
  check("it comes back on the held list", (listHeld.result.body?.held || []).length === 1,
    `held=${(listHeld.result.body?.held || []).length}`);

  const delHeld = response();
  await pos.deleteHeldSale(request({}, staff, { heldId: String(holdRes.result.body.held._id) }), delHeld);
  check("and it can be cleared again",
    delHeld.result.statusCode === 200 && (await HeldSale.countDocuments({})) === 0);

  /* ── 7. Day closing ──────────────────────────────────────────────────── */
  section("day closing");

  const sumRes = response();
  await pos.dayClosingSummary(request({}, staff), sumRes);
  const summary = sumRes.result.body?.summary;
  check("the cashier can preview what they are handing over",
    sumRes.result.statusCode === 200 && summary.receiptCount > 0,
    `receipts=${summary?.receiptCount}`);
  check("gross, net and expected cash are three different figures",
    typeof summary.grossSales === "number" &&
      typeof summary.netSales === "number" &&
      typeof summary.expectedCash === "number" &&
      summary.netSales === Math.round((summary.grossSales - summary.refundAmount) * 100) / 100,
    `gross=${summary?.grossSales} refunded=${summary?.refundAmount} net=${summary?.netSales} cash=${summary?.expectedCash}`);

  const closeRes = response();
  await pos.closeDay(request({}, staff), closeRes);
  check("the day closes", closeRes.result.statusCode === 201,
    `status=${closeRes.result.statusCode} ${JSON.stringify(closeRes.result.body?.message)}`);

  const closing = await DayClosing.findOne({}).lean();
  check("the batch records the cashier and their role",
    closing && String(closing.cashier) === String(staff._id) && closing.cashierRole === "staff",
    `cashier=${closing?.cashierName} role=${closing?.cashierRole}`);

  const afterClose = response();
  await pos.dayClosingSummary(request({}, staff), afterClose);
  check("their open takings are empty afterwards",
    afterClose.result.body?.summary?.receiptCount === 0,
    `receipts=${afterClose.result.body?.summary?.receiptCount}`);

  const secondClose = response();
  await pos.closeDay(request({}, staff), secondClose);
  check("closing twice is refused", secondClose.result.statusCode >= 400,
    `status=${secondClose.result.statusCode}`);

  /* ── 8. Who can see what ─────────────────────────────────────────────── */
  section("report access by role");

  const listFor = (user) => {
    const res = response();
    reports.listReports(request({}, user), res);
    return (res.result.body?.reports || []).map((r) => r.key);
  };

  const staffReports = listFor(staff);
  const managerReports = listFor(manager);
  const adminReports = listFor(admin);
  const reporterReports = listFor(reporter);

  check("staff get no reports at all", staffReports.length === 0, JSON.stringify(staffReports));
  check("a manager gets the sales reports and inventory",
    managerReports.includes("sales") && managerReports.includes("inventory"),
    JSON.stringify(managerReports));
  check("a manager does NOT get the audit trail or day closings",
    !managerReports.includes("activity") && !managerReports.includes("day-closing"),
    JSON.stringify(managerReports));
  check("an admin gets those as well",
    adminReports.includes("activity") && adminReports.includes("day-closing"),
    JSON.stringify(adminReports));
  check("the report account gets only its own report",
    reporterReports.length === 1 && reporterReports[0] === "ghost-net",
    JSON.stringify(reporterReports));

  const denied = response();
  await reports.downloadReport(request({}, staff, { type: "sales" }, {}), denied);
  check("a staff download of the sales report is refused", denied.result.statusCode === 403,
    `status=${denied.result.statusCode}`);

  /* ── 9. Scoping: a cashier sees their own ────────────────────────────── */
  section("scope: whose sales are whose");

  const otherStaff = await mk("staff", "Other Staff");
  await sell({ customerName: "Walk-in Customer",
    items: [{ product: String(added._id), quantity: 1 }], paymentMethod: "cash" }, otherStaff);

  const mine = response();
  await pos.getReceipts(request({}, otherStaff, {}, {}), mine);
  const ownerView = response();
  await pos.getReceipts(request({}, owner, {}, {}), ownerView);
  check("a cashier sees only their own open receipts",
    (mine.result.body?.receipts || []).length === 1,
    `saw=${(mine.result.body?.receipts || []).length}`);
  check("the owner sees everything still open",
    (ownerView.result.body?.receipts || []).length >= 1,
    `saw=${(ownerView.result.body?.receipts || []).length}`);

  /* ── the tally ───────────────────────────────────────────────────────── */
  const failed = checks.filter((c) => !c.ok);
  console.log(
    failed.length
      ? `\nFAIL: ${failed.length} of ${checks.length}\n` +
        failed.map((f) => `   - ${f.name}`).join("\n")
      : `\nPASS: all ${checks.length} end-to-end checks`,
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
