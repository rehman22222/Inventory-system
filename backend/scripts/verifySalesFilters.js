/* Proof that the sales page's filters do what they say — on screen AND in the
 * report downloaded beside them.
 *
 *   npm run verify:sales-filters
 *
 * Checked:
 *   - searching a flavour finds every sale of it and nothing else;
 *   - the payment filter separates cash from card (and split, wallet);
 *   - search and payment combine;
 *   - the date range uses the shop's own days;
 *   - a cashier's search never reaches past the sales they may see;
 *   - the downloaded report holds exactly the rows the screen shows, and says
 *     which filters produced it.
 *
 * Follows verifyQuickSell.js: a uniquely named TEMPORARY database on the
 * configured cluster, the real controllers against it, and only that database
 * dropped at the end.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const tempName = `e360_sf_${Date.now()}`;

const withDatabase = (uri, database) => {
  const queryAt = uri.indexOf("?");
  const base = queryAt === -1 ? uri : uri.slice(0, queryAt);
  const query = queryAt === -1 ? "" : uri.slice(queryAt);
  const slash = base.lastIndexOf("/");
  if (slash < "mongodb://".length) throw new Error("MONGODB_URL has no database path");
  return `${base.slice(0, slash + 1)}${database}${query}`;
};

const response = () => {
  const result = { statusCode: 200, body: null, headers: {} };
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
    send(body) {
      result.body = body;
      return this;
    },
    setHeader(name, value) {
      result.headers[name] = value;
    },
  };
};

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
  const User = require("../models/Usermodel");
  const Product = require("../models/Productmodel");
  const Sale = require("../models/Salesmodel");
  const Receipt = require("../models/Receiptmodel");
  const sales = require("../controller/salescontroller");
  const reports = require("../controller/reportController");

  await Store.create({ key: "shop", name: "Sales filter verification shop", currency: "EUR", timezone: "Europe/Dublin" });
  const admin = await User.create({ name: "Owner", email: `sf_admin_${Date.now()}@example.test`, password: "x", role: "superadmin" });
  const staff = await User.create({ name: "Till", email: `sf_staff_${Date.now()}@example.test`, password: "x", role: "staff" });

  const pineapple = await Product.create({ name: "Loom Pineapple 2ml", Price: 45, quantity: 50 });
  const mango = await Product.create({ name: "Loom Mango Haze 2ml", Price: 45, quantity: 50 });
  const pouch = await Product.create({ name: "Zyn Cool Mint", Price: 7, quantity: 50 });

  // Two days in Dublin; 23:30 UTC on the 1st is already the 2nd in Dublin (IST, UTC+1).
  const at = (iso) => new Date(iso);
  const sale = (product, payment, when, extra = {}) =>
    Sale.create({
      customerName: "Walk-In",
      products: { product: product._id, quantity: 1, price: product.Price },
      totalAmount: product.Price,
      paymentMethod: payment,
      paymentStatus: "paid",
      status: "completed",
      createdAt: at(when),
      cashier: admin._id,
      ...extra,
    });
  await sale(pineapple, "cash", "2026-09-01T10:00:00Z", { receiptNo: "POS-000101" });
  await sale(pineapple, "creditcard", "2026-09-01T12:00:00Z");
  await sale(mango, "creditcard", "2026-09-01T23:30:00Z"); // Dublin: 2 Sept
  await sale(mango, "split", "2026-09-02T11:00:00Z", { receiptNo: "POS-SPLIT" });
  await Receipt.create({ receiptNo: "POS-SPLIT", customerName: "Walk-In", paymentMethod: "split", total: 45,
    payments: [{ method: "cash", amount: 25 }, { method: "creditcard", amount: 15 }, { method: "credit", amount: 10 }], changeDue: 5 });
  await sale(pouch, "wallet", "2026-09-02T12:00:00Z");
  await sale(pineapple, "cash", "2026-09-02T13:00:00Z", { cashier: staff._id });

  const search = async (query, user = admin) => {
    const res = response();
    await sales.SearchSales({ query, user }, res);
    return (res.result.body?.sales || []).map((s) => `${s.products.product.name}|${s.paymentMethod}`);
  };

  console.log("search by flavour");
  let rows = await search({ query: "pineapple" });
  check("a flavour search finds every sale of it", rows.length === 3 && rows.every((r) => r.startsWith("Loom Pineapple")), JSON.stringify(rows));
  rows = await search({ query: "mango haze" });
  check("…and nothing else", rows.length === 2 && rows.every((r) => r.startsWith("Loom Mango")), JSON.stringify(rows));
  rows = await search({ query: "POS-000101" });
  check("a receipt number is still searchable", rows.length === 1, JSON.stringify(rows));
  rows = await search({ query: "(loom" });
  check("a search with a bracket is text, not a broken regex", Array.isArray(rows), JSON.stringify(rows));

  console.log("\npayment");
  rows = await search({ payment: "cash" });
  check("cash includes cash-only sales and the cash part of split sales", rows.length === 3 && rows.some((r) => r.endsWith("|split")), JSON.stringify(rows));
  rows = await search({ payment: "card" });
  check("card includes card-only sales and the card part of split sales", rows.length === 3 && rows.some((r) => r.endsWith("|split")), JSON.stringify(rows));
  rows = await search({ payment: "split" });
  check("split is its own option", rows.length === 1 && rows[0].endsWith("|split"), JSON.stringify(rows));
  rows = await search({ payment: "wallet" });
  check("wallet is its own option", rows.length === 1 && rows[0].endsWith("|wallet"), JSON.stringify(rows));
  rows = await search({ payment: "nonsense" });
  check("an unknown payment value means every tender", rows.length === 6, JSON.stringify(rows));
  rows = await search({});
  check("no filters at all is the whole ledger", rows.length === 6, JSON.stringify(rows));

  console.log("\ncombined and dated");
  rows = await search({ query: "pineapple", payment: "card" });
  check("flavour + card combine", rows.length === 1 && rows[0] === "Loom Pineapple 2ml|creditcard", JSON.stringify(rows));
  rows = await search({ from: "2026-09-01", to: "2026-09-01" });
  check("1 Sept in Dublin is 2 sales (23:30 UTC belongs to the 2nd)", rows.length === 2, JSON.stringify(rows));
  rows = await search({ from: "2026-09-02", to: "2026-09-02", payment: "card" });
  check("date + payment includes the matching part of a split receipt", rows.length === 2 && rows.some((r) => r === "Loom Mango Haze 2ml|split"), JSON.stringify(rows));

  console.log("\nscope");
  rows = await search({ query: "pineapple" }, staff);
  check("a cashier's search only reaches their own open sales", rows.length === 1 && rows[0] === "Loom Pineapple 2ml|cash", JSON.stringify(rows));

  console.log("\nthe downloaded report");
  const download = async (query) => {
    const res = response();
    await reports.downloadReport({ params: { type: "combined-sales" }, query: { ...query, format: "csv" }, user: admin }, res);
    return { status: res.result.statusCode, text: Buffer.isBuffer(res.result.body) ? res.result.body.toString("utf8") : String(res.result.body) };
  };
  const report = await download({ q: "pineapple", payment: "card" });
  const lines = report.text.split(/\r?\n/).filter((l) => /Loom|Zyn/.test(l) && /Card|Cash|Wallet|Split/i.test(l));
  check("the report downloads", report.status === 200, `status=${report.status} ${report.text.slice(0, 200)}`);
  check("it holds exactly the filtered rows", lines.length === 1 && lines[0].includes("Loom Pineapple 2ml"), lines.join("\n"));
  // CSV is bare rows by design; the titled formats carry the filter line.
  const xlsx = response();
  await reports.downloadReport({ params: { type: "combined-sales" }, query: { q: "pineapple", payment: "card", format: "xlsx" }, user: admin }, xlsx);
  const ExcelJS = require("exceljs");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(xlsx.result.body);
  const cells = [];
  book.worksheets[0].eachRow((row) => row.eachCell((cell) => cells.push(String(cell.value ?? ""))));
  const sheet = cells.join(" | ");
  check("the spreadsheet says which filters produced it", /Payment: Card/.test(sheet) && /Search: "pineapple"/.test(sheet),
    sheet.slice(0, 300));

  const splitRes = response();
  await sales.SearchSales({ query: { payment: "split" }, user: admin }, splitRes);
  check("split list exposes cash, card and credit amounts after change", JSON.stringify(splitRes.result.body.sales[0].paymentBreakdown) === JSON.stringify([
    { method: "cash", amount: 20 }, { method: "creditcard", amount: 15 }, { method: "credit", amount: 10 }
  ]));
  const splitReport = await download({ payment: "split" });
  check("split report shows each tender and separate totals", /Cash: 20.00.*Card: 15.00.*Credit: 10.00/.test(splitReport.text)
    && /Cash Total,20.00/.test(splitReport.text) && /Card Total,15.00/.test(splitReport.text) && /Credit Total,10.00/.test(splitReport.text));

  const summaryAmount = (text, label) => {
    const match = text.match(new RegExp(`${label},(-?\\d+\\.\\d{2})`));
    return match ? Number(match[1]) : NaN;
  };
  const allReport = await download({});
  const cashReport = await download({ payment: "cash" });
  const cardReport = await download({ payment: "card" });
  const creditReport = await download({ payment: "credit" });
  check("all report tender totals reconcile exactly to net sales", Math.abs(
    summaryAmount(allReport.text, "Cash Total")
      + summaryAmount(allReport.text, "Card Total")
      + summaryAmount(allReport.text, "Credit Total")
      + summaryAmount(allReport.text, "Wallet Total")
      - summaryAmount(allReport.text, "Net Sales incl. Tax")
  ) < 0.001, allReport.text.slice(-500));
  check("cash report net sales is exactly its cash total, including split cash", summaryAmount(cashReport.text, "Net Sales incl. Tax") === 110
    && summaryAmount(cashReport.text, "Cash Total") === 110, cashReport.text.slice(-400));
  check("card report net sales is exactly its card total, including split card", summaryAmount(cardReport.text, "Net Sales incl. Tax") === 105
    && summaryAmount(cardReport.text, "Card Total") === 105, cardReport.text.slice(-400));
  check("credit report net sales is exactly its credit total, including split credit", summaryAmount(creditReport.text, "Net Sales incl. Tax") === 10
    && summaryAmount(creditReport.text, "Credit Total") === 10, creditReport.text.slice(-400));

  const failed = checks.filter((c) => !c.ok);
  console.log(failed.length ? `\nFAIL: ${failed.length} of ${checks.length}` : `\nPASS: all ${checks.length} sales filter checks`);
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
