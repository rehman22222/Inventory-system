const mongoose = require("mongoose");

require("dotenv").config();

module.exports.MongoDBconfig = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL, {
      serverSelectionTimeoutMS: 20000,
    });
    console.log("connected to database successfully");
  } catch (err) {
    console.error("MonogoDB Connection Error", err.message);
    console.error(
      "Tip: if this is 'querySrv ETIMEOUT', your DNS can't resolve the mongodb+srv record — use the non-SRV MONGODB_URL in .env."
    );
  }
};
