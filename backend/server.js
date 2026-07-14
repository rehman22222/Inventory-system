const express = require("express");
const { MongoDBconfig } = require('./libs/mongoconfig');
const { Server } = require("socket.io");
const http = require("http");
const cors = require('cors');
const cookieParser = require("cookie-parser");
const authrouter = require('./Routers/authRouther');
const productrouter = require('./Routers/ProductRouter');
const orderrouter = require('./Routers/orderRouter');
const categoryrouter = require("./Routers/categoryRouter")
const notificationrouter = require("./Routers/notificationRouters");
const activityrouter = require("./Routers/activityRouter");
const inventoryrouter = require('./Routers/inventoryRouter');
const salesrouter = require('./Routers/salesRouter');
const supplierrouter = require('./Routers/supplierrouter');
const stocktransactionrouter = require('./Routers/stocktransactionrouter');
const posrouter = require("./Routers/posRouter");
const voucherrouter = require("./Routers/voucherRouter");
const ticketrouter = require("./Routers/ticketRouter");
const reportrouter = require("./Routers/reportRouter");
const localStorageRouter = require("./localStorageRouter");


require("dotenv").config();
const PORT = process.env.PORT || 3003;
const useLocalStorage = process.env.USE_LOCAL_STORAGE === "true";

const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:3000,https://advanced-inventory-management-system.vercel.app")
  .split(",")
  .map((origin) => origin.trim());

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  },
});

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  credentials: true,
}));



io.on("connection", (socket) => {
  console.log("A user connected");

 
  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
})




app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));
app.set("io", io);
app.use(cookieParser());

// Lightweight health check — used for uptime/warm-up pings (e.g. Render free tier).
app.get(["/health", "/api/health"], (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

if (useLocalStorage) {
  app.use("/api", localStorageRouter(app));
} else {
  app.use('/api/auth', authrouter);
  app.use('/api/product', productrouter);
  app.use('/api/order', orderrouter);
  app.use('/api/category', categoryrouter);
  app.use('/api/notification', notificationrouter);
  app.use('/api/activitylogs', activityrouter(app)); 
  app.use('/api/inventory', inventoryrouter);
  app.use('/api/sales', salesrouter);
  app.use('/api/pos', posrouter);
  app.use('/api/voucher', voucherrouter);
  app.use('/api/ticket', ticketrouter);
  app.use('/api/reports', reportrouter);
  app.use('/api/supplier', supplierrouter);
  app.use("/api/stocktransaction", stocktransactionrouter);
}

// Return JSON (not HTML) for upload/multer errors like oversized or non-image files.
app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ message: err.message || "Upload failed" });
  }
  next();
});




server.listen(PORT, () => {
  if (useLocalStorage) {
    console.log("Using local JSON storage. MongoDB connection skipped.");
  } else {
    MongoDBconfig();
  }

  const cloudinaryReady = Boolean(
    (process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME) &&
      (process.env.CLOUDINARY_API_KEY || process.env.API_KEY) &&
      (process.env.CLOUDINARY_API_SECRET || process.env.API_SECRET)
  );
  if (cloudinaryReady) {
    console.log(
      `[Cloudinary] configured (cloud: ${process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME}) — image uploads enabled`
    );
  } else {
    console.warn(
      "[Cloudinary] NOT configured — image uploads will fail. Set CLOUDINARY_* in backend/.env and restart."
    );
  }

  console.log(`The server is running at port ${PORT}`);
});

// Keep-alive: Render's free tier sleeps after ~15 min without inbound traffic.
// Ping our own /health every 13 min so the instance stays warm. Uses
// RENDER_EXTERNAL_URL (auto-set by Render); a no-op locally where it's absent.
const keepAliveUrl = process.env.RENDER_EXTERNAL_URL;
if (keepAliveUrl) {
  const PING_INTERVAL_MS = 13 * 60 * 1000;
  setInterval(() => {
    fetch(`${keepAliveUrl}/health`)
      .then((res) => console.log(`[keep-alive] /health -> ${res.status}`))
      .catch((err) => console.warn(`[keep-alive] ping failed: ${err.message}`));
  }, PING_INTERVAL_MS);
  console.log(`[keep-alive] enabled — pinging ${keepAliveUrl}/health every 13 min`);
}

module.exports = { io, server};
