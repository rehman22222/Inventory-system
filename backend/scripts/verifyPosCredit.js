/* Live proof of the credit-term change, end to end through the real checkout.
 *
 * A sale on account used to be given a fortnight whether or not anybody had
 * agreed one: `Number(creditTerms?.termDays || 14)` turned "no term" into a due
 * date, and the credit book then chased the customer for missing it. The till
 * can now agree three things — a run of days, an open term with no date on it
 * ("2W+"), or no term at all — and this drives a real basket through
 * posController.checkout for each of them.
 *
 * Follows verifyOnlinePromotions.js exactly: a uniquely named TEMPORARY
 * database is created on the configured cluster, the real controllers run
 * against it, and only that database is dropped at the end. Nothing in the
 * shop's own data is read or written.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const tempName = `e360_pos_credit_verify_${Date.now()}`;

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

const request = (body = {}, user = null) => ({
  body,
  params: {},
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
    throw new Error(`Refusing to run: connected to ${mongoose.connection.name}, not the temp database`);
  }
  console.log(`temporary database: ${mongoose.connection.name}\n`);

  const Store = require("../models/Storemodel");
  const Product = require("../models/Productmodel");
  const Receipt = require("../models/Receiptmodel");
  const User = require("../models/Usermodel");
  const pos = require("../controller/posController");

  await Store.create({ key: "shop", name: "Credit verification shop", currency: "EUR" });
  const cashier = await User.create({
    name: "Verify Cashier",
    email: `verify_${Date.now()}@example.test`,
    password: "not-a-real-password",
    role: "admin",
  });

  const makeProduct = (tag) =>
    Product.create({
      name: `Credit proof ${tag}`,
      Price: 10,
      quantity: 50,
      barcode: `CRD-${tag}-${Date.now()}`,
    });

  // One basket per term, each fully on account so credit is what settles it.
  const sell = async (tag, creditTerms) => {
    const product = await makeProduct(tag);
    const req = request(
      {
        customerName: "Verify Customer",
        items: [{ product: String(product._id), quantity: 2, price: 10 }],
        payments: [{ method: "credit", amount: 20 }],
        creditTerms,
      },
      cashier,
    );
    const res = response();
    await pos.checkout(req, res);
    if (res.result.statusCode !== 201) {
      throw new Error(`checkout failed for ${tag}: ${JSON.stringify(res.result.body)}`);
    }
    const stored = await Receipt.findOne({ receiptNo: res.result.body.receipt.receiptNo }).lean();
    const after = await Product.findById(product._id).lean();
    return { body: res.result.body.receipt, stored, stockAfter: after.quantity };
  };

  const contact = { email: "owed@example.test", phone: "0871234567" };

  // --- 1. A run of days: a term the server can put a date on ------------------
  const seven = await sell("7D", { ...contact, termDays: 7, termLabel: undefined });
  const sevenDue = seven.stored.credit?.dueAt;
  const daysOut = sevenDue ? Math.round((new Date(sevenDue) - Date.now()) / 864e5) : null;
  check(
    "7D  stores termDays 7 and a due date about seven days out",
    seven.stored.credit?.termDays === 7 && daysOut === 7,
    `termDays=${seven.stored.credit?.termDays} dueAt=+${daysOut}d`,
  );

  // --- 2. "2W+": agreed, but with no date behind it ---------------------------
  const open = await sell("2WPLUS", { ...contact, termDays: null, termLabel: "2W+" });
  check(
    '2W+ stores the label, no termDays, and NO due date',
    open.stored.credit?.termLabel === "2W+" &&
      open.stored.credit?.termDays == null &&
      open.stored.credit?.dueAt == null,
    `termLabel=${open.stored.credit?.termLabel} termDays=${open.stored.credit?.termDays} dueAt=${open.stored.credit?.dueAt}`,
  );

  // --- 3. The cross: no term agreed at all ------------------------------------
  const none = await sell("NOTERM", { ...contact, termDays: null });
  check(
    "x   no term agreed stores no termDays, no label and no due date",
    none.stored.credit?.termDays == null &&
      none.stored.credit?.termLabel == null &&
      none.stored.credit?.dueAt == null,
    `termDays=${none.stored.credit?.termDays} termLabel=${none.stored.credit?.termLabel} dueAt=${none.stored.credit?.dueAt}`,
  );

  // This is the regression the change exists to prevent: before it, both of the
  // above were silently given a fortnight's due date.
  check(
    "neither open term was quietly given a fortnight",
    open.stored.credit?.dueAt == null && none.stored.credit?.dueAt == null,
  );

  // --- 4. The receipt the till prints carries the term ------------------------
  check(
    "checkout response returns credit so the slip can print the term",
    open.body.credit?.termLabel === "2W+" && seven.body.credit?.termDays === 7,
    `open=${JSON.stringify(open.body.credit)} seven=${JSON.stringify(seven.body.credit)}`,
  );

  // --- 5. An open term must never read as overdue -----------------------------
  const overdueNow = (r) =>
    Boolean(r.stored.credit?.dueAt && new Date(r.stored.credit.dueAt).getTime() < Date.now());
  check(
    "an open term never reads as overdue",
    !overdueNow(open) && !overdueNow(none),
  );

  // --- 6. Stock still moves on a credit sale ----------------------------------
  check(
    "goods leave the shelf on a sale that was not paid for",
    seven.stockAfter === 48 && open.stockAfter === 48 && none.stockAfter === 48,
    `7D=${seven.stockAfter} 2W+=${open.stockAfter} x=${none.stockAfter} (from 50, sold 2)`,
  );

  // --- 7. Part cash, part account --------------------------------------------
  const splitProduct = await makeProduct("SPLIT");
  const splitReq = request(
    {
      customerName: "Split Customer",
      items: [{ product: String(splitProduct._id), quantity: 2, price: 10 }],
      payments: [
        { method: "cash", amount: 12 },
        { method: "credit", amount: 8 },
      ],
      creditTerms: { ...contact, termDays: 7 },
    },
    cashier,
  );
  const splitRes = response();
  await pos.checkout(splitReq, splitRes);
  const splitStored =
    splitRes.result.statusCode === 201
      ? await Receipt.findOne({ receiptNo: splitRes.result.body.receipt.receiptNo }).lean()
      : null;
  check(
    "a split basket books only the credit half on the account",
    splitRes.result.statusCode === 201 &&
      splitStored?.credit?.amount === 8 &&
      splitStored?.paymentMethod === "split",
    `status=${splitRes.result.statusCode} onAccount=${splitStored?.credit?.amount} method=${splitStored?.paymentMethod}`,
  );

  // --- 8. The server still insists on a way to collect ------------------------
  const noContactProduct = await makeProduct("NOCONTACT");
  const badReq = request(
    {
      customerName: "No Contact",
      items: [{ product: String(noContactProduct._id), quantity: 1, price: 10 }],
      payments: [{ method: "credit", amount: 10 }],
      creditTerms: { email: "", phone: "", termDays: 7 },
    },
    cashier,
  );
  const badRes = response();
  await pos.checkout(badReq, badRes);
  check(
    "credit with no email and no phone is still refused",
    badRes.result.statusCode >= 400,
    `status=${badRes.result.statusCode} body=${JSON.stringify(badRes.result.body)}`,
  );

  const failed = checks.filter((c) => !c.ok);
  console.log(
    failed.length
      ? `\nFAIL: ${failed.length} of ${checks.length}`
      : `\nPASS: all ${checks.length} credit checks`,
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
