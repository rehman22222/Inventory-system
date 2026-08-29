/* Why can nobody sign in?
 *
 *   npm run diagnose-login
 *   npm run diagnose-login -- someone@shop.ie
 *
 * A stored password is bcrypt over an HMAC of the password and PASSWORD_PEPPER
 * (see libs/password.js). Change or lose that pepper and every hash written
 * under the old one stops verifying — and the only thing the till says is
 * "Email or password is incorrect", which sends you hunting for the wrong bug.
 *
 * This prints what the running environment believes, and what the accounts in
 * the database were actually written with. It reads; it never writes.
 *
 * It prints no secrets: not the pepper, not a hash, not the credentials in the
 * connection string. The pepper appears only as a short fingerprint — a sha256
 * prefix — which is enough to tell two environments apart and useless for
 * recovering the value.
 */
require("dotenv").config();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const fingerprint = (value) =>
  value ? crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 8) : null;

const run = async () => {
  const wanted = String(process.argv[2] || "").trim().toLowerCase();
  const pepper = process.env.PASSWORD_PEPPER || "";

  console.log("── this environment ──────────────────────────────────");
  console.log("PASSWORD_PEPPER      :", pepper ? `set (fingerprint ${fingerprint(pepper)})` : "NOT SET");
  console.log("PASSWORD_BCRYPT_ROUNDS:", process.env.PASSWORD_BCRYPT_ROUNDS || "(unset → 12)");
  console.log("USE_LOCAL_STORAGE    :", process.env.USE_LOCAL_STORAGE || "(unset → real database)");
  console.log("NODE_ENV             :", process.env.NODE_ENV || "(unset)");
  console.log(
    "LOCAL_DEV_LOGIN      :",
    process.env.LOCAL_DEV_LOGIN_PASSWORD
      ? `enabled for ${process.env.LOCAL_DEV_LOGIN_EMAIL || "admin@e360pro.com"}`
      : "not configured",
  );

  const uri = process.env.MONGODB_URL || process.env.MONGO_URL || process.env.MONGO_URI;
  console.log(
    "database             :",
    uri ? uri.replace(/\/\/[^@]*@/, "//<credentials>@").split("?")[0] : "NO CONNECTION STRING",
  );

  if (!uri) {
    console.log("\nNothing to check without a connection string.");
    return;
  }

  await mongoose.connect(uri);

  // Case-insensitive on purpose: an account stored with capitals is exactly the
  // fault this is looking for, and an exact match would hide it.
  const query = wanted
    ? {
        email: new RegExp(
          `^\\s*${wanted.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
          "i",
        ),
      }
    : {};
  const users = await mongoose.connection.db
    .collection("users")
    .find(query, { projection: { email: 1, role: 1, password: 1, updatedAt: 1 } })
    .sort({ email: 1 })
    .toArray();

  if (users.length === 0) {
    console.log(
      wanted
        ? `\nNo account with the email ${wanted}, in any capitalisation. That alone explains the message.`
        : "\nThis database has no user accounts at all.",
    );
    await mongoose.disconnect();
    return;
  }

  console.log(`\n── ${users.length} account(s) ───────────────────────────────────`);
  const mixedCase = [];
  for (const user of users) {
    let cost;
    try {
      cost = bcrypt.getRounds(String(user.password || ""));
    } catch {
      cost = "NOT A BCRYPT HASH";
    }

    const stored = String(user.email || "");
    const normalised = stored.trim().toLowerCase() === stored;
    if (!normalised) mixedCase.push(user);

    console.log(
      [
        stored.padEnd(34),
        String(user.role || "").padEnd(11),
        `cost=${cost}`.padEnd(9),
        `last written ${user.updatedAt ? new Date(user.updatedAt).toISOString() : "unknown"}`,
        normalised ? "" : "  ← STORED WITH CAPITALS: CANNOT SIGN IN",
      ].join(" "),
    );
  }

  if (mixedCase.length > 0) {
    console.log(`
── found it ──────────────────────────────────────────
The login lowercases what is typed before looking anybody up, so ${
      mixedCase.length === 1 ? "this account is" : "these accounts are"
    } invisible
to it — the password was never the problem. Fix in the database:
`);
    for (const user of mixedCase) {
      console.log(
        `  db.users.updateOne({_id:ObjectId("${user._id}")},{$set:{email:"${String(user.email)
          .trim()
          .toLowerCase()}"}})`,
      );
    }
    console.log(
      "\nNew accounts are normalised on write, so this cannot happen again.",
    );
  }

  if (process.env.NODE_ENV !== "production" && process.env.PASSWORD_PEPPER) {
    console.log(`
── warning ───────────────────────────────────────────
This is not a production deployment, it has a PASSWORD_PEPPER, and it is
pointed at the database above. Signing in here used to rewrite the account's
hash under THIS machine's pepper, locking the live site out of it — which is
exactly how the superadmin lost access. The login no longer re-hashes outside
production, but anything else you run against this database is still the live
shop's data.`);
  }

  console.log(`
── reading this ──────────────────────────────────────
A hash is written under whichever PASSWORD_PEPPER was loaded at the time, and
signing in successfully on a machine whose pepper differs REWRITES it to that
machine's pepper — which locks the other deployment out. So:

  · "last written" close to when the trouble started, on an account you use in
    two places, is the whole story: the peppers differ.
  · Compare the fingerprint above with the one this prints on your other
    deployment. Same fingerprint means the pepper is not your problem.
  · If they differ, decide which is correct, copy that PASSWORD_PEPPER to the
    other, and reset the affected passwords under it (npm run create-superadmin
    mints a fresh account under whatever pepper is loaded).

Nothing here has been changed.`);

  await mongoose.disconnect();
};

run().catch((error) => {
  console.error("Could not finish:", error.message);
  process.exitCode = 1;
});
