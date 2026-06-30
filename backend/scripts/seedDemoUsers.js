const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
require("dotenv").config();

const User = require("../models/Usermodel");

const demoUsers = [
  {
    name: "Demo Admin",
    email: "admin@example.com",
    password: "Admin@123",
    role: "admin",
  },
  {
    name: "Demo Manager",
    email: "manager@example.com",
    password: "Manager@123",
    role: "manager",
  },
  {
    name: "Demo Staff",
    email: "staff@example.com",
    password: "Staff@123",
    role: "staff",
  },
];

async function seedDemoUsers() {
  const mongoUrl = process.env.MONGODB_URL;

  if (!mongoUrl) {
    throw new Error("MONGODB_URL is missing. Add it to backend/.env first.");
  }

  await mongoose.connect(mongoUrl);

  for (const user of demoUsers) {
    const hashedPassword = await bcrypt.hash(user.password, 10);

    await User.findOneAndUpdate(
      { email: user.email },
      {
        name: user.name,
        email: user.email,
        password: hashedPassword,
        role: user.role,
        ProfilePic: "",
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`Seeded ${user.role}: ${user.email} / ${user.password}`);
  }

  await mongoose.disconnect();
}

seedDemoUsers()
  .then(() => {
    console.log("Demo users are ready.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to seed demo users:", error.message);
    process.exit(1);
  });
