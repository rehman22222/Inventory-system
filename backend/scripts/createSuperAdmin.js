/**
 * Creates (or resets the password of) the vendor's super-admin account.
 *
 * There is deliberately NO route that can mint a superadmin — not signup, not
 * the admin's "create user" form. It only exists via this script, run by us
 * against the database.
 *
 *   npm run create-superadmin -- "Name" email@domain.com "password"
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/Usermodel");

const [name, email, password] = process.argv.slice(2);

(async () => {
  if (!name || !email || !password) {
    console.error('Usage: npm run create-superadmin -- "Name" email@domain.com "password"');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Use a password of at least 8 characters for the vendor account.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 20000 });
  console.log(`connected to ${mongoose.connection.name}`);

  const normalized = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalized });
  const hashed = await bcrypt.hash(password, 10);

  if (existing) {
    existing.name = name;
    existing.password = hashed;
    existing.role = "superadmin";
    await existing.save();
    console.log(`Updated existing account ${normalized} → superadmin, password reset.`);
  } else {
    await User.create({
      name,
      email: normalized,
      password: hashed,
      role: "superadmin",
      ProfilePic: "",
    });
    console.log(`Super admin created: ${normalized}`);
  }

  await mongoose.disconnect();
  process.exit(0);
})().catch((error) => {
  console.error("Failed:", error.message);
  process.exit(1);
});
