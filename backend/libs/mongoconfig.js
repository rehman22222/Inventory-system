const mongoose = require("mongoose");

require("dotenv").config();

module.exports.MongoDBconfig = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL, {
      serverSelectionTimeoutMS: 20000,
      // Connection pool: reuse a warm set of sockets instead of opening one per
      // request, so a burst of concurrent users doesn't stall on handshakes.
      // maxPoolSize is per-instance — Atlas M0/M10 caps total connections, so
      // keep this modest and let it be tuned from the environment if a bigger
      // tier is used.
      maxPoolSize: Number(process.env.DB_POOL_MAX) || 20,
      minPoolSize: Number(process.env.DB_POOL_MIN) || 2,
      // Drop idle pooled sockets after 60s so we don't sit on the cap.
      maxIdleTimeMS: 60000,
      // Fail a stuck socket read rather than hang the request forever.
      socketTimeoutMS: 45000,
    });
    console.log("connected to database successfully");
  } catch (err) {
    console.error("MonogoDB Connection Error", err.message);
    console.error(
      "Tip: if this is 'querySrv ETIMEOUT', your DNS can't resolve the mongodb+srv record — use the non-SRV MONGODB_URL in .env."
    );
  }
};
