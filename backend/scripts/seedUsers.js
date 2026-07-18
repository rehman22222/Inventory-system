const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
require("dotenv").config();

const User = require("../models/Usermodel");

// The ONLY login accounts a fresh deployment should have — one per role. Run
// `npm run seed` after setting MONGODB_URL. Share these with the client, who
// changes the passwords from inside the app afterwards.
//
// (Superadmin can also be created/reset on its own with `npm run create-superadmin`.)
const users = [
  { name: "Owner",         email: "superadmin@e360.app", password: "Superadmin@123", role: "superadmin" },
  { name: "Administrator", email: "admin@e360.app",      password: "Admin@123",      role: "admin" },
  { name: "Store Manager", email: "manager@e360.app",    password: "Manager@123",    role: "manager" },
  { name: "Store Staff",   email: "staff@e360.app",      password: "Staff@123",      role: "staff" },
];

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
    const hashedPassword = await bcrypt.hash(user.password, 10);
    await User.findOneAndUpdate(
      { email: user.email },
      { name: user.name, email: user.email, password: hashedPassword, role: user.role, ProfilePic: "" },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`  ✓ ${user.role.padEnd(11)} ${user.email} / ${user.password}`);
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
