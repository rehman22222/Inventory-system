const mongoose = require("mongoose");

/* One row per API request that reached the server (see middleware/requestLogger).
 *
 * The activity log records the actions the code chose to name. This records
 * the traffic itself — every call, read or write, allowed or refused — so "who
 * called what, from where, and when" has an answer even for a route nobody
 * thought to log, and even when the request failed.
 *
 * It never holds a request or response body: no passwords, tokens, card data or
 * customer details. The one exception is the email typed at a staff login
 * attempt, which is what makes a run of failed logins readable.
 *
 * RETENTION. Rows carry their own expiry (`expiresAt`, TTL index), because the
 * two kinds of row are worth keeping for different lengths of time:
 *   - changes and refusals (POST/PUT/PATCH/DELETE, 401/403/429):
 *       REQUEST_LOG_RETENTION_DAYS, default 180
 *   - successful reads (GET):
 *       REQUEST_LOG_READ_RETENTION_DAYS, default 30
 * Reads are most of the traffic and matter for weeks, not months. Keeping them
 * as long as the writes would multiply the collection's size for little gain.
 * Changing either setting affects new rows only.
 *
 * Read it with scripts/readRequestLogs.js.
 */

const days = (value, fallback) => Math.max(1, Number(value) || fallback);
const RETENTION_DAYS = days(process.env.REQUEST_LOG_RETENTION_DAYS, 180);
const READ_RETENTION_DAYS = days(process.env.REQUEST_LOG_READ_RETENTION_DAYS, 30);

const RequestLogSchema = new mongoose.Schema(
  {
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    method: { type: String, required: true },
    // Path only; the query string is dropped (it can carry search terms and
    // customer details).
    path: { type: String, required: true },
    status: { type: Number, required: true },
    durationMs: { type: Number },
    ip: { type: String },
    userAgent: { type: String },
    // Who, when the request carried a valid session. Name and role are copied
    // in so the row still reads correctly after the account is renamed or
    // deleted.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
    userRole: { type: String },
    // Staff login attempts only: the email that was typed.
    attemptedEmail: { type: String },
    // True when the client went away before the response finished.
    aborted: { type: Boolean },
  },
  { versionKey: false }
);

// Each row is deleted by MongoDB once its own expiresAt has passed.
RequestLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
RequestLogSchema.index({ createdAt: -1 });
RequestLogSchema.index({ userId: 1, createdAt: -1 });
RequestLogSchema.index({ ip: 1, createdAt: -1 });

module.exports = mongoose.model("RequestLog", RequestLogSchema);
module.exports.RETENTION_DAYS = RETENTION_DAYS;
module.exports.READ_RETENTION_DAYS = READ_RETENTION_DAYS;
