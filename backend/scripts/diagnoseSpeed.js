/* Why is the till slow?
 *
 *   npm run diagnose-speed
 *
 * Run this ON THE SERVER THAT SERVES THE SHOP, not on a laptop. That is the
 * whole point of it: the till's speed is decided almost entirely by how far the
 * app server sits from the database, and measuring that from a development
 * machine on the other side of the world tells you about the development
 * machine.
 *
 * A checkout is not one database call, it is a short sequence of them — read
 * the basket, take the next receipt number, deduct the stock, write the
 * movements, write the sale rows, write the receipt, commit. Roughly EIGHT
 * round trips, one after another, because each one needs the answer from the
 * one before it.
 *
 * That makes the arithmetic simple and unforgiving:
 *
 *     time at the till  ≈  8  ×  round-trip time to the database
 *
 * At 2ms (server and database in the same region) a sale lands in well under a
 * tenth of a second. At 90ms (different continents) the same sale takes most of
 * a second, with a customer standing there — and no amount of tuning the code
 * changes that, because the code is already batched and parallel where it can
 * be. The number below is the one that matters.
 *
 * READ ONLY. It counts documents and pings; it writes nothing, so it is safe to
 * run against the live shop during trading.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const ROUND_TRIPS_PER_SALE = 8;

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const run = async () => {
  const uri = process.env.MONGODB_URL || process.env.MONGO_URL || process.env.MONGO_URI;

  if (!uri) {
    console.error("No MONGODB_URL in the environment — nothing to measure.");
    process.exitCode = 1;
    return;
  }

  console.log("── where this is running ─────────────────────────────────");
  console.log("host          :", require("os").hostname());
  console.log("NODE_ENV      :", process.env.NODE_ENV || "(unset)");
  console.log(
    "database      :",
    uri.replace(/\/\/[^@]*@/, "//<credentials>@").split("?")[0],
  );

  const connectStart = Date.now();
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20_000 });
  console.log("connect       :", `${Date.now() - connectStart} ms (once, at boot)`);

  const admin = mongoose.connection.db.admin();

  // Warm the pool so the first slow socket handshake is not counted as latency.
  for (let i = 0; i < 3; i += 1) await admin.ping();

  const pings = [];
  for (let i = 0; i < 15; i += 1) {
    const started = Date.now();
    await admin.ping();
    pings.push(Date.now() - started);
  }

  const rtt = median(pings);
  const best = Math.min(...pings);
  const worst = Math.max(...pings);

  console.log("\n── round trip to the database ───────────────────────────");
  console.log(`median        : ${rtt} ms`);
  console.log(`best / worst  : ${best} ms / ${worst} ms`);

  const estimate = rtt * ROUND_TRIPS_PER_SALE;
  console.log("\n── what that means at the till ──────────────────────────");
  console.log(
    `a checkout is about ${ROUND_TRIPS_PER_SALE} round trips, so expect roughly ${estimate} ms`,
  );
  console.log("(the basket size barely matters — the per-item work is batched)");

  let verdict;
  if (rtt <= 5) {
    verdict =
      "GOOD. The database is beside the server. If the till still feels slow,\n" +
      "        the cause is in the browser or the network between till and server,\n" +
      "        not in the database — say so and it can be looked at separately.";
  } else if (rtt <= 25) {
    verdict =
      "ACCEPTABLE. Same region, but not the same datacentre. A sale lands in a\n" +
      "        couple of hundred milliseconds. Worth improving, not urgent.";
  } else if (rtt <= 60) {
    verdict =
      "SLOW. The database is a long way from the server. This is the whole\n" +
      "        problem — move the Atlas cluster to the same region as the app.";
  } else {
    verdict =
      "VERY SLOW. The server and the database are almost certainly on different\n" +
      "        continents. Every sale pays this eight times over. Moving the Atlas\n" +
      "        cluster to the app's own region is worth more than any code change,\n" +
      "        by a wide margin.";
  }
  console.log(`\nverdict       : ${verdict}`);

  console.log("\n── catalogue size (what each till downloads on open) ────");
  const Product = require("../models/Productmodel");
  const [total, scannable, cards] = await Promise.all([
    Product.estimatedDocumentCount(),
    Product.countDocuments({ barcode: { $exists: true, $nin: [null, ""] } }),
    Product.countDocuments({ quickSell: true }),
  ]);
  console.log(`products      : ${total} total, ${scannable} scannable, ${cards} quick-sell card(s)`);
  console.log("(the till fetches the scannable set once when it opens, gzipped —");
  console.log(" this is a page-load cost, not a per-sale one)");

  console.log("\nNothing was written. Safe to run again at any time.");
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error("\nCould not measure:", error.message);
  process.exitCode = 1;
  mongoose.disconnect().catch(() => {});
});
