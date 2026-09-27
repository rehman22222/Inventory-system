/* Server-side request log: who called which API, from where, and when.
 *
 * WHAT IS RECORDED (REQUEST_LOG_MODE):
 *   "all" (default)  every request under /api — reads and writes, staff and
 *                    website, allowed or refused.
 *   "writes"         only POST/PUT/PATCH/DELETE, plus any refused request
 *                    (401/403/429). A lighter setting if storage gets tight.
 *   "off"            nothing.
 * Never recorded, in any mode: the health check (an uptime pinger hits it
 * constantly), CORS preflights and HEAD requests, and anything outside /api
 * (the React build's files).
 *
 * WHAT IS NEVER STORED: request or response bodies, query strings, cookies, or
 * headers other than the User-Agent. See models/RequestLogmodel.
 *
 * WHY IT CANNOT HURT THE TILL:
 *   - A row is built after the response has gone, never before it.
 *   - Rows are queued in memory and written in batches (every FLUSH_MS, or as
 *     soon as BATCH_SIZE are waiting), one batch at a time. However busy the
 *     shop is, logging uses at most one database connection, never a burst of
 *     them from the pool the checkout needs.
 *   - A failed write is reported once and dropped; it never reaches a request.
 *   - If the database is down long enough for MAX_QUEUE rows to pile up, new
 *     rows are dropped (and counted) rather than growing memory without limit.
 *
 * On SIGTERM (a deploy or restart) whatever is still queued is written before
 * the process exits, bounded by SHUTDOWN_FLUSH_MS.
 */

const mongoose = require("mongoose");
const RequestLog = require("../models/RequestLogmodel");

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const REFUSED_STATUSES = new Set([401, 403, 429]);
const SKIPPED_PATHS = new Set(["/api/health"]);
const STAFF_LOGIN_PATH = "/api/auth/login";
const MODES = ["all", "writes", "off"];

const BATCH_SIZE = 200;
const FLUSH_MS = 2000;
const MAX_QUEUE = 10000;
const SHUTDOWN_FLUSH_MS = 3000;

const MAX_PATH = 300;
const MAX_USER_AGENT = 300;
const MAX_EMAIL = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

const cleanPath = (req) => String(req.originalUrl || req.url || "").split("?")[0].slice(0, MAX_PATH);

const isChangeOrRefusal = (method, status) => WRITE_METHODS.has(method) || REFUSED_STATUSES.has(status);

/** Decide whether a finished request gets a row. Exported for the test. */
const shouldLog = (mode, method, path, status) => {
  if (mode === "off") return false;
  if (!path.startsWith("/api/") || SKIPPED_PATHS.has(path)) return false;
  if (method === "OPTIONS" || method === "HEAD") return false;
  return mode === "all" || isChangeOrRefusal(method, status);
};

/** The row for one request. Exported for the test. */
const buildEntry = (req, res, { startedAt, aborted, retentionDays, readRetentionDays }) => {
  const now = new Date();
  const status = aborted ? 499 : res.statusCode;
  const keepDays = isChangeOrRefusal(req.method, status) ? retentionDays : readRetentionDays;
  const path = cleanPath(req);
  const user = req.user;

  const entry = {
    createdAt: now,
    expiresAt: new Date(now.getTime() + keepDays * DAY_MS),
    method: req.method,
    path,
    status,
    durationMs: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6),
    ip: req.ip,
  };
  const userAgent = req.get?.("user-agent");
  if (userAgent) entry.userAgent = String(userAgent).slice(0, MAX_USER_AGENT);
  if (user?._id) {
    entry.userId = user._id;
    entry.userName = user.name;
    entry.userRole = user.role;
  }
  if (path === STAFF_LOGIN_PATH && req.body?.email) {
    entry.attemptedEmail = String(req.body.email).trim().toLowerCase().slice(0, MAX_EMAIL);
  }
  if (aborted) entry.aborted = true;
  return entry;
};

// Not connected (starting up, or a blip): report it as a failure so the batch
// is dropped rather than held, and memory stays flat.
const insertBatch = (rows) => {
  if (mongoose.connection.readyState !== 1) {
    return Promise.reject(new Error("database not connected"));
  }
  return RequestLog.collection.insertMany(rows, { ordered: false });
};

/**
 * @param {object}   [options]
 * @param {string}   [options.mode]        see the header; defaults to REQUEST_LOG_MODE or "all"
 * @param {function} [options.writeBatch]  (rows) => Promise; defaults to a RequestLog insertMany
 * @param {number}   [options.flushMs]     how often queued rows are written
 * @param {boolean}  [options.flushOnShutdown]  write the queue on SIGTERM (off in tests)
 * @returns {function} the middleware, with `.flush()` and `.stats()` attached
 */
const createRequestLogger = (options = {}) => {
  const {
    mode,
    writeBatch = insertBatch,
    flushMs = FLUSH_MS,
    // Only the real, database-backed logger owns shutdown; a test's does not.
    flushOnShutdown = !options.writeBatch,
  } = options;
  const requested = mode || process.env.REQUEST_LOG_MODE;
  const activeMode = MODES.includes(requested) ? requested : "all";
  const retentionDays = RequestLog.RETENTION_DAYS;
  const readRetentionDays = RequestLog.READ_RETENTION_DAYS;

  let queue = [];
  let flushing = null;
  let dropped = 0;
  let written = 0;
  let lastWarnedAt = 0;

  const warn = (message) => {
    // At most once a minute, so an outage cannot flood the server log.
    const now = Date.now();
    if (now - lastWarnedAt < 60 * 1000) return;
    lastWarnedAt = now;
    console.error(`Request log: ${message}`);
  };

  const flush = () => {
    if (flushing) return flushing;
    if (!queue.length) return Promise.resolve();

    const batch = queue.slice(0, BATCH_SIZE);
    queue = queue.slice(batch.length);

    flushing = Promise.resolve()
      .then(() => writeBatch(batch))
      .then(() => {
        written += batch.length;
      })
      .catch((error) => {
        dropped += batch.length;
        warn(`${batch.length} row(s) not written (${error.message}); ${dropped} dropped in total.`);
      })
      .finally(() => {
        flushing = null;
        // More arrived while writing: keep going rather than wait a full tick.
        if (queue.length >= BATCH_SIZE) void flush();
      });
    return flushing;
  };

  const drain = async () => {
    while (queue.length || flushing) await flush();
  };

  if (activeMode !== "off") {
    const timer = setInterval(() => void flush(), flushMs);
    // Never keep the process alive just to write logs.
    timer.unref?.();

    if (flushOnShutdown) {
      process.once("SIGTERM", () => {
        const deadline = new Promise((resolve) => setTimeout(resolve, SHUTDOWN_FLUSH_MS).unref?.());
        Promise.race([drain(), deadline]).finally(() => {
          // Our listener was the only one and has been removed by `once`, so
          // re-raising gives Node's default: exit.
          process.kill(process.pid, "SIGTERM");
        });
      });
    }
  }

  const middleware = (req, res, next) => {
    if (activeMode === "off") return next();

    const startedAt = process.hrtime.bigint();
    let done = false;

    const record = (aborted) => {
      if (done) return;
      done = true;

      const entry = buildEntry(req, res, { startedAt, aborted, retentionDays, readRetentionDays });
      if (!shouldLog(activeMode, entry.method, entry.path, entry.status)) return;

      if (queue.length >= MAX_QUEUE) {
        dropped += 1;
        warn(`queue full (${MAX_QUEUE}); ${dropped} row(s) dropped in total.`);
        return;
      }
      queue.push(entry);
      if (queue.length >= BATCH_SIZE) void flush();
    };

    res.on("finish", () => record(false));
    res.on("close", () => record(!res.writableFinished));
    next();
  };

  middleware.flush = drain;
  middleware.stats = () => ({ mode: activeMode, queued: queue.length, written, dropped });
  return middleware;
};

module.exports = { createRequestLogger, shouldLog, buildEntry };
