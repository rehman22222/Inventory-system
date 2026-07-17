const express = require("express");
const { MongoDBconfig } = require('./libs/mongoconfig');
const { Server } = require("socket.io");
const http = require("http");
const path = require("path");
const fs = require("fs");
const cors = require('cors');
const cookieParser = require("cookie-parser");
const compression = require("compression");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
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
const dealrouter = require("./Routers/dealRouter");
const storerouter = require("./Routers/storeRouter");
const ticketrouter = require("./Routers/ticketRouter");
const approvalrouter = require("./Routers/approvalRouter");
const reorderrouter = require("./Routers/reorderRouter");
const reportrouter = require("./Routers/reportRouter");
const localStorageRouter = require("./localStorageRouter");


require("dotenv").config();
const PORT = process.env.PORT || 3003;
const useLocalStorage = process.env.USE_LOCAL_STORAGE === "true";

const app = express();
const server = http.createServer(app);

// We sit behind Render's/Vercel's proxy in production, so the real client IP is
// in X-Forwarded-For. Trust one proxy hop so req.ip (used by rate-limiting and
// the activity log) is the caller, not the load balancer.
app.set("trust proxy", 1);

// Don't advertise the framework — one less thing for a scanner to fingerprint.
app.disable("x-powered-by");

// Security headers. This is a JSON API with a separate frontend, so the two
// headers that assume you're serving HTML (CSP, cross-origin resource policy)
// are turned off — they'd add nothing here and can block the SPA's XHR. What we
// keep is the useful part: nosniff, HSTS, no framing (clickjacking), a locked
// referrer policy, and DNS-prefetch control.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// Gzip responses. Reports, product lists and sales history are large JSON
// payloads; compressing them cuts transfer size ~70% and speeds every client.
app.use(compression());
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

// Rate limiting. Generous enough that a busy shop with many tills never notices
// it, but low enough to blunt scripted abuse and credential-stuffing. The health
// check sits above this and is never throttled (keep-alive pings hit it often).
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 600, // per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests — please slow down and try again shortly." },
});

// A much tighter cap on the login endpoint specifically, to slow brute-forcing
// without locking out a shop that's simply busy.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 40, // per IP per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failed attempts count toward the cap
  message: { message: "Too many login attempts — please wait a few minutes and try again." },
});

app.use("/api", apiLimiter);
app.use("/api/auth/login", authLimiter);

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
  app.use('/api/deal', dealrouter);
  app.use('/api/store', storerouter);
  app.use('/api/ticket', ticketrouter);
  app.use('/api/approval', approvalrouter);
  app.use('/api/reorder', reorderrouter);
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

// Full-stack single deployment: serve the built React app from the same server.
// The API lives under /api; every other path falls through to index.html so
// client-side routing works on refresh/deep links. If no build is present (API-
// only hosting, or local dev where the SPA runs on its own port) this is skipped.
const clientBuild = path.join(__dirname, "..", "frontend", "build");
if (fs.existsSync(path.join(clientBuild, "index.html"))) {
  app.use(express.static(clientBuild));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientBuild, "index.html"));
  });
  console.log(`[static] serving frontend build from ${clientBuild}`);
} else {
  console.log("[static] no frontend build found — running API-only");
}




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
