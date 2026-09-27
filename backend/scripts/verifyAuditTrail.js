/* Proof that the audit trail records what it claims to.
 *
 *   node scripts/verifyAuditTrail.js
 *
 * Needs no database and no network. It exercises:
 *   - libs/auditDiff: an edit's before/after is captured, and fields nobody
 *     touched are NOT reported just because their type changed on the way
 *     through (35 vs "35", ObjectId vs string, Date vs ISO string).
 *   - middleware/requestLogger: which requests get a row, how long it is kept,
 *     what the row holds, and — the part that matters most — that it never
 *     holds a body, a query string or a password, batches its writes, and never
 *     delays or breaks the response.
 */

const { EventEmitter } = require("events");
const mongoose = require("mongoose");
const { snapshot, diff, describe } = require("../libs/auditDiff");
const { createRequestLogger, shouldLog } = require("../middleware/requestLogger");

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail ? `\n      ${detail}` : ""}`);
};

// ── auditDiff ──────────────────────────────────────────────────────────────
{
  const categoryId = new mongoose.Types.ObjectId();
  const fields = ["name", "Price", "costPrice", "Category", "expiryDate", "barcode"];
  const product = {
    name: "Loom Pineapple 2ml",
    Price: 50,
    costPrice: 0,
    Category: categoryId,
    expiryDate: new Date("2027-01-01T00:00:00Z"),
    barcode: undefined,
  };
  const before = snapshot(product, fields);

  // Same values, different shapes — none of these is a change.
  product.Price = "50";
  product.Category = String(categoryId);
  product.expiryDate = "2027-01-01T00:00:00.000Z";
  product.barcode = "";
  check("unchanged values in a different type are not reported", diff(before, product, fields).length === 0,
    JSON.stringify(diff(before, product, fields)));

  product.Price = 44.99;
  const changes = diff(before, product, fields);
  check("a price cut is captured with its old and new value",
    changes.length === 1 && changes[0].field === "Price" && changes[0].from === 50 && changes[0].to === 44.99,
    JSON.stringify(changes));

  const line = describe(changes, { labels: { Price: "price" } });
  check("the description reads 'price 50 → 44.99'", line === "price 50 → 44.99", line);

  product.Category = new mongoose.Types.ObjectId();
  product.name = "Loom Pineapple 2ML";
  const line2 = describe(diff(before, product, fields), { labels: { Price: "price", Category: "category" }, opaque: ["Category"] });
  check("ids are named, not printed", line2.includes("category changed") && !line2.includes(String(product.Category)), line2);
  check("text changes are quoted", line2.includes('name "Loom Pineapple 2ml" → "Loom Pineapple 2ML"'), line2);
}

// ── requestLogger: which requests get a row ────────────────────────────────
check("by default every API read is logged", shouldLog("all", "GET", "/api/product", 200));
check("by default website reads are logged too", shouldLog("all", "GET", "/api/storefront/products", 200));
check("POST under /api is logged", shouldLog("all", "POST", "/api/product/edit/1", 200));
check("a failed request is logged", shouldLog("all", "PUT", "/api/deal/1", 500));
check("'writes' mode skips a successful read", !shouldLog("writes", "GET", "/api/product", 200));
check("'writes' mode still logs a refused read", shouldLog("writes", "GET", "/api/reports/sales", 401));
check("'writes' mode still logs a rate-limited read", shouldLog("writes", "GET", "/api/product", 429));
check("'writes' mode logs a DELETE", shouldLog("writes", "DELETE", "/api/deal/1", 200));
check("the health check is never logged", !shouldLog("all", "GET", "/api/health", 200));
check("CORS preflights are never logged", !shouldLog("all", "OPTIONS", "/api/product", 204));
check("HEAD requests are never logged", !shouldLog("all", "HEAD", "/api/product", 200));
check("non-API paths (the React build) are never logged", !shouldLog("all", "GET", "/assets/index.js", 200));
check("'off' logs nothing", !shouldLog("off", "POST", "/api/product", 500));

// ── requestLogger: end to end with a fake request/response ─────────────────
const fakeExchange = ({ method, url, body, user, statusCode = 200 }) => {
  const req = {
    method,
    originalUrl: url,
    url,
    body,
    user,
    ip: "39.34.190.181",
    get: (name) => (name.toLowerCase() === "user-agent" ? "Mozilla/5.0 (Test)" : undefined),
  };
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.writableFinished = true;
  return { req, res };
};

const DAY = 24 * 60 * 60 * 1000;
const daysKept = (row) => Math.round((row.expiresAt - row.createdAt) / DAY);

const run = async () => {
  const rows = [];
  let batches = 0;
  const logger = createRequestLogger({
    writeBatch: async (batch) => { batches += 1; rows.push(...batch); },
    flushMs: 60 * 60 * 1000, // flushed by hand below, never by the timer
  });
  const hit = (options) => {
    const { req, res } = fakeExchange(options);
    let nextCalled = false;
    logger(req, res, () => { nextCalled = true; });
    return { res, nextCalled };
  };

  // A price edit by a signed-in manager.
  const userId = new mongoose.Types.ObjectId();
  {
    const { res, nextCalled } = hit({
      method: "PUT",
      url: "/api/product/editproduct/abc?token=secret&q=customer@example.com",
      body: { Price: 29.99, password: "hunter2" },
      user: { _id: userId, name: "Store Manager", role: "manager" },
    });
    check("the request is passed on immediately", nextCalled);
    res.emit("finish");
    res.emit("close"); // both fire in real life; must not double-log
    check("nothing is written to the database per request", rows.length === 0 && logger.stats().queued === 1);
    await logger.flush();

    const row = rows[0] || {};
    check("one row per request, even though finish and close both fired", rows.length === 1, `rows=${rows.length}`);
    check("the row names the method, path, status, IP and device",
      row.method === "PUT" && row.path === "/api/product/editproduct/abc" && row.status === 200 &&
      row.ip === "39.34.190.181" && row.userAgent === "Mozilla/5.0 (Test)", JSON.stringify(row));
    check("the row names the user as they were at the time",
      String(row.userId) === String(userId) && row.userName === "Store Manager" && row.userRole === "manager");
    const serialised = JSON.stringify(row);
    check("the query string is dropped", !serialised.includes("token") && !serialised.includes("customer@example.com"), serialised);
    check("the body is never stored", !serialised.includes("hunter2") && !serialised.includes("29.99"), serialised);
    check("the time is recorded", row.createdAt instanceof Date && typeof row.durationMs === "number");
    check("a change is kept for 180 days", daysKept(row) === 180, `kept ${daysKept(row)}`);
  }

  // A plain read, and a refused one.
  {
    rows.length = 0;
    hit({ method: "GET", url: "/api/reports/sales" }).res.emit("finish");
    hit({ method: "GET", url: "/api/reports/sales", statusCode: 401 }).res.emit("finish");
    await logger.flush();
    check("a read is kept for 30 days", rows[0] && daysKept(rows[0]) === 30, rows[0] && `kept ${daysKept(rows[0])}`);
    check("a refused read is kept as long as a change", rows[1] && daysKept(rows[1]) === 180, rows[1] && `kept ${daysKept(rows[1])}`);
  }

  // A failed staff login: the typed email is kept, the password is not.
  {
    rows.length = 0;
    hit({
      method: "POST",
      url: "/api/auth/login",
      body: { email: "  Manager@Shop.ie ", password: "wrong-password" },
      statusCode: 400,
    }).res.emit("finish");
    await logger.flush();
    const serialised = JSON.stringify(rows[0] || {});
    check("a login attempt records the email typed", rows[0]?.attemptedEmail === "manager@shop.ie", serialised);
    check("a login attempt never records the password", !serialised.includes("wrong-password"), serialised);
  }

  // A client that hangs up mid-request.
  {
    rows.length = 0;
    const { res } = hit({ method: "POST", url: "/api/pos/checkout" });
    res.writableFinished = false;
    res.emit("close");
    await logger.flush();
    check("an abandoned request is recorded as aborted", rows[0]?.aborted === true && rows[0]?.status === 499,
      JSON.stringify(rows[0]));
  }

  // A busy till: many requests become a few batched writes, not one each.
  {
    rows.length = 0;
    batches = 0;
    for (let i = 0; i < 450; i += 1) hit({ method: "GET", url: `/api/product/barcode/${i}` }).res.emit("finish");
    await logger.flush();
    check("450 requests are all recorded", rows.length === 450, `rows=${rows.length}`);
    check("450 requests take 3 database writes, not 450", batches === 3, `batches=${batches}`);
  }

  // A broken database must not break the request.
  {
    const originalError = console.error;
    let reported = 0;
    console.error = () => { reported += 1; };
    const failing = createRequestLogger({
      writeBatch: async () => { throw new Error("db down"); },
      flushMs: 60 * 60 * 1000,
    });
    let threw = false;
    try {
      for (let round = 0; round < 3; round += 1) {
        const { req, res } = fakeExchange({ method: "POST", url: "/api/product" });
        failing(req, res, () => {});
        res.emit("finish");
        await failing.flush();
      }
    } catch {
      threw = true;
    } finally {
      console.error = originalError;
    }
    check("a failed log write never throws into the request", !threw);
    check("a failing database is reported once, not per request", reported === 1, `reported=${reported}`);
    check("rows that could not be written are counted as dropped", failing.stats().dropped === 3,
      JSON.stringify(failing.stats()));
  }

  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll audit trail checks passed.");
  process.exit(failures ? 1 : 0);
};

run();
