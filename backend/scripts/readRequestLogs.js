/* Read the server-side request log.
 *
 *   node scripts/readRequestLogs.js [filters]
 *   npm run request-logs -- [filters]
 *
 * READ ONLY. It opens the database, reads, prints, and disconnects. There is no
 * create, update or delete anywhere in this file, and index building is off, so
 * it is safe to run against the live shop.
 *
 * FILTERS (all optional, combine freely):
 *   --hours 24                last N hours (default 24)
 *   --since 2026-09-27        from this date/time (UTC unless a zone is given);
 *   --until 2026-09-28          overrides --hours
 *   --user "store manager"    user name contains (case-insensitive)
 *   --ip 39.34.190.181        exact IP
 *   --path /api/product       path contains
 *   --method PUT              exact method
 *   --status 401              exact status; "4xx" / "5xx" for a range
 *   --changes                 only POST/PUT/PATCH/DELETE
 *   --limit 500               rows to print (default 200, newest first)
 *   --summary                 counts per user and IP instead of rows, and the
 *                             size of the whole log
 *   --csv out.csv             also write the matching rows to a CSV file
 *
 * EXAMPLES
 *   Everything one person changed yesterday:
 *     node scripts/readRequestLogs.js --user manager --changes --since 2026-09-27 --until 2026-09-28
 *   Refused requests in the last week, by who and where:
 *     node scripts/readRequestLogs.js --status 4xx --hours 168 --summary
 */

require("dotenv").config();
const fs = require("fs");
const mongoose = require("mongoose");

mongoose.set("autoIndex", false);
mongoose.set("autoCreate", false);
const RequestLog = require("../models/RequestLogmodel");

const parseArgs = (argv) => {
  const flags = new Set(["changes", "summary"]);
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, "");
    if (flags.has(key)) out[key] = true;
    else out[key] = argv[++i];
  }
  return out;
};

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildQuery = (args) => {
  const query = {};
  const until = args.until ? new Date(args.until) : new Date();
  const since = args.since
    ? new Date(args.since)
    : new Date(until.getTime() - (Number(args.hours) || 24) * 60 * 60 * 1000);
  if (Number.isNaN(since.getTime()) || Number.isNaN(until.getTime())) {
    throw new Error("--since / --until must be dates, e.g. 2026-09-27 or 2026-09-27T13:00Z");
  }
  query.createdAt = { $gte: since, $lt: until };

  if (args.user) query.userName = { $regex: escapeRegex(args.user), $options: "i" };
  if (args.ip) query.ip = args.ip;
  if (args.path) query.path = { $regex: escapeRegex(args.path), $options: "i" };
  if (args.method) query.method = String(args.method).toUpperCase();
  if (args.changes) query.method = { $in: ["POST", "PUT", "PATCH", "DELETE"] };
  if (args.status) {
    const range = /^([1-5])xx$/i.exec(args.status);
    query.status = range
      ? { $gte: Number(range[1]) * 100, $lt: Number(range[1]) * 100 + 100 }
      : Number(args.status);
  }
  return { query, since, until };
};

const stamp = (date) => new Date(date).toISOString().replace("T", " ").slice(0, 19) + "Z";

const csvCell = (value) => {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const { query, since, until } = buildQuery(args);

  if (!process.env.MONGODB_URL) throw new Error("MONGODB_URL is not configured");
  await mongoose.connect(process.env.MONGODB_URL, {
    serverSelectionTimeoutMS: 20000,
    autoIndex: false,
    autoCreate: false,
  });
  console.log(`Request log, ${stamp(since)} → ${stamp(until)} (read only)\n`);

  if (args.summary) {
    const groups = await RequestLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: { user: "$userName", ip: "$ip" },
          requests: { $sum: 1 },
          changes: { $sum: { $cond: [{ $in: ["$method", ["POST", "PUT", "PATCH", "DELETE"]] }, 1, 0] } },
          refused: { $sum: { $cond: [{ $in: ["$status", [401, 403, 429]] }, 1, 0] } },
          first: { $min: "$createdAt" },
          last: { $max: "$createdAt" },
        },
      },
      { $sort: { requests: -1 } },
    ]);
    console.table(
      groups.map((g) => ({
        user: g._id.user || "(not signed in)",
        ip: g._id.ip,
        requests: g.requests,
        changes: g.changes,
        refused: g.refused,
        first: stamp(g.first),
        last: stamp(g.last),
      }))
    );

    // How big the log is overall, so storage can be watched (read only).
    const stats = await mongoose.connection.db
      .command({ collStats: RequestLog.collection.collectionName })
      .catch(() => null);
    if (stats) {
      const mb = (bytes) => `${(Number(bytes || 0) / 1024 / 1024).toFixed(1)} MB`;
      console.log(
        `\nWhole log: ${stats.count} row(s), data ${mb(stats.size)}, ` +
          `on disk ${mb(stats.storageSize)} + indexes ${mb(stats.totalIndexSize)}.`
      );
    }
  } else {
    const limit = Math.max(1, Number(args.limit) || 200);
    const total = await RequestLog.countDocuments(query);
    const rows = await RequestLog.find(query).sort({ createdAt: -1 }).limit(limit).lean();

    for (const row of rows) {
      console.log(
        [
          stamp(row.createdAt),
          (row.userName || row.attemptedEmail || "-").padEnd(18),
          (row.ip || "-").padEnd(15),
          row.method.padEnd(6),
          String(row.status),
          `${row.durationMs ?? "-"}ms`.padStart(7),
          row.path,
          row.aborted ? "(aborted)" : "",
        ].join("  ")
      );
    }
    console.log(`\n${rows.length} of ${total} matching row(s) shown, newest first.`);

    if (args.csv) {
      const columns = ["createdAt", "userName", "userRole", "attemptedEmail", "ip", "method", "status", "durationMs", "path", "userAgent", "aborted"];
      const all = await RequestLog.find(query).sort({ createdAt: 1 }).lean();
      const lines = [columns.join(",")].concat(
        all.map((row) =>
          columns.map((c) => csvCell(c === "createdAt" ? row.createdAt.toISOString() : row[c])).join(",")
        )
      );
      fs.writeFileSync(args.csv, lines.join("\n"));
      console.log(`All ${all.length} matching row(s) written to ${args.csv}`);
    }
  }

  await mongoose.disconnect();
})().catch(async (error) => {
  console.error("ERROR:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
