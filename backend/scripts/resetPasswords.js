/**
 * Resets the passwords of accounts that already exist, from a JSON file.
 *
 *   npm run reset-passwords -- ./path/to/creds.json
 *
 * The file is an array of { email, password }. Keep it OUTSIDE the repo and
 * delete it once the client has the new passwords — it is plaintext.
 *
 * Two things this deliberately does differently from `seedUsers.js`:
 *
 *  1. It never creates an account. A mistyped email is a loud "not found",
 *     not a silent extra login sitting on the live shop forever.
 *
 *  2. It hashes WITHOUT the pepper, whatever this machine's PASSWORD_PEPPER
 *     says. That is not laziness — see the comment in authcontroller's login.
 *     A hash written under a laptop's pepper can never be verified by the live
 *     site, which is how the shop got locked out once already. An unpeppered
 *     hash verifies on BOTH kinds of deployment: a server with no pepper
 *     compares it directly, and a server with one falls through to
 *     verifyPassword's plain-compare branch and then re-hashes the account
 *     under its own pepper on that first sign-in. Self-healing either way.
 */
require("dotenv").config();

// Must happen before libs/password is asked to hash anything.
const hadPepper = Boolean(process.env.PASSWORD_PEPPER);
delete process.env.PASSWORD_PEPPER;

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { hashPassword, verifyPassword } = require("../libs/password");
const User = require("../models/Usermodel");

const MIN_LENGTH = 10; // matches the check in authcontroller / approvalController

const readCredentials = (file) => {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("The credentials file must be a non-empty JSON array.");
  }

  return parsed.map((entry, index) => {
    const email = String(entry.email || "").trim().toLowerCase();
    const password = String(entry.password || "");
    if (!email) throw new Error(`Entry ${index + 1} has no email.`);
    if (password.length < MIN_LENGTH) {
      throw new Error(
        `Entry ${index + 1} (${email}): password must be at least ${MIN_LENGTH} characters.`,
      );
    }
    return { email, password };
  });
};

(async () => {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npm run reset-passwords -- ./creds.json");
    process.exit(1);
  }

  const credentials = readCredentials(path.resolve(file));

  if (!process.env.MONGODB_URL) {
    throw new Error("MONGODB_URL is missing. Add it to backend/.env first.");
  }

  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 20000 });
  console.log(`connected to ${mongoose.connection.name}`);
  if (hadPepper) {
    console.log("PASSWORD_PEPPER was set here and has been ignored on purpose (see the header comment).");
  }

  let failures = 0;

  for (const { email, password } of credentials) {
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      console.error(`  x ${email} — no such account, skipped (nothing was created)`);
      failures += 1;
      continue;
    }

    user.password = await hashPassword(password);
    await user.save();

    // Read it back the way the login route would, so a "done" here means the
    // account really can be signed into and not merely that a write returned.
    const stored = await User.findOne({ email }).select("+password");
    const check = await verifyPassword(password, stored.password);
    if (!check.valid) {
      console.error(`  x ${email} — written but did NOT verify; investigate before handing this over`);
      failures += 1;
      continue;
    }

    console.log(`  ok ${String(user.role).padEnd(11)} ${email} — password reset and verified`);
  }

  await mongoose.disconnect();

  if (failures) {
    console.error(`\n${failures} account(s) did not reset. Nothing else was changed.`);
    process.exit(1);
  }
  console.log("\nAll passwords reset. Delete the credentials file now.");
})().catch(async (error) => {
  console.error("Failed:", error.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
