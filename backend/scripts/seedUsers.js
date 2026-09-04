const { hashPassword } = require("../libs/password");
const mongoose = require("mongoose");
require("dotenv").config();

const User = require("../models/Usermodel");

// The ONLY login accounts a fresh deployment should have — one per role. Run
// `npm run seed` after setting MONGODB_URL.
//
// Two rules this file learned the hard way:
//
//  1. The emails are @e360pro.com, matching what is actually on the live shop.
//     They read @e360.app for a while, which meant a seed run against a live
//     database did not touch the real accounts at all — it quietly minted four
//     more logins beside them.
//
//  2. NO PASSWORDS LIVE IN THIS FILE. They used to, and the file is in git, so
//     every login for every deployment was readable by anyone with the repo —
//     and a seed run silently reverted whatever the client had changed them to
//     back to those published defaults. Passwords for a fresh install now come
//     from the environment, and an account that already exists NEVER has its
//     password rewritten here.
//
// To rotate the password of an account that already exists, use
// `npm run reset-passwords -- ./creds.json`, which is built for exactly that.
// (Superadmin can also be created/reset on its own with `npm run create-superadmin`.)
const users = [
  { name: "Owner",           email: "superadmin@e360pro.com", envKey: "SEED_SUPERADMIN_PASSWORD", role: "superadmin" },
  { name: "Administrator",   email: "admin@e360pro.com",      envKey: "SEED_ADMIN_PASSWORD",      role: "admin" },
  { name: "Store Manager",   email: "manager@e360pro.com",    envKey: "SEED_MANAGER_PASSWORD",    role: "manager" },
  { name: "Store Staff",     email: "staff@e360pro.com",      envKey: "SEED_STAFF_PASSWORD",      role: "staff" },
  { name: "Reports Officer", email: "reports@e360pro.com",    envKey: "SEED_REPORT_PASSWORD",     role: "report" },
];

const MIN_LENGTH = 10; // matches the check in authcontroller / approvalController

// Demo/sample accounts the old seed scripts used to create. We remove them so a
// cleaned deployment isn't left with stray logins.
const demoEmails = [
  "admin@example.com",
  "manager@example.com",
  "staff@example.com",
];

// Pass --prune-others to ALSO delete every account that isn't one of the four
// above (e.g. to reset a test database to a pristine four-account state). Off by
// default so real staff added through the app are never touched.
const pruneOthers = process.argv.includes("--prune-others");

async function seed() {
  const mongoUrl = process.env.MONGODB_URL;
  if (!mongoUrl) {
    throw new Error("MONGODB_URL is missing. Add it to backend/.env first.");
  }

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 20000 });
  console.log(`connected to ${mongoose.connection.name}`);

  const keepEmails = users.map((u) => u.email);

  for (const user of users) {
    const existing = await User.findOne({ email: user.email });

    if (existing) {
      // Name and role are safe to re-assert; the password is not ours to touch.
      // Somebody may have rotated it hours ago, and a seed run is not a reason
      // to hand the shop back a password the client thinks is retired.
      existing.name = user.name;
      existing.role = user.role;
      await existing.save();
      console.log(`  = ${user.role.padEnd(11)} ${user.email} — already exists, password left alone`);
      continue;
    }

    const password = process.env[user.envKey] || "";
    if (password.length < MIN_LENGTH) {
      throw new Error(
        `${user.email} does not exist yet and ${user.envKey} is unset or shorter than ` +
          `${MIN_LENGTH} characters. Set it in the environment (not in this file) and re-run.`,
      );
    }

    await User.create({
      name: user.name,
      email: user.email,
      password: await hashPassword(password),
      role: user.role,
      ProfilePic: "",
    });
    console.log(`  + ${user.role.padEnd(11)} ${user.email} — created from ${user.envKey}`);
  }

  // Always clear the known demo accounts.
  const removedDemo = await User.deleteMany({ email: { $in: demoEmails } });
  if (removedDemo.deletedCount) {
    console.log(`  – removed ${removedDemo.deletedCount} demo account(s)`);
  }

  if (pruneOthers) {
    const pruned = await User.deleteMany({ email: { $nin: keepEmails } });
    console.log(`  – pruned ${pruned.deletedCount} other account(s) (--prune-others)`);
  }

  await mongoose.disconnect();
}

seed()
  .then(() => {
    console.log("Accounts are ready.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to seed accounts:", error.message);
    process.exit(1);
  });
