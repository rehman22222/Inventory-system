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
const { adminRouter: onlineAdminRouter, storefrontRouter } = require("./Routers/onlineStoreRouter");
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

// One canonical hostname. www.<domain> and <domain> were both serving the app
// with no redirect between them, which cost us twice:
//
//   - The session cookie is host-only. Signing in on the bare domain and then
//     opening the www one showed a logged-out app, because the cookie simply
//     wasn't sent to that host.
//   - Google saw two hostnames serving identical pages. The canonical tag
//     points at the bare domain, so it resolves — but only after Google has
//     crawled both and worked it out.
//
// This is deliberately narrow: it folds a leading "www." onto the bare host and
// touches nothing else. It cannot misdirect the main domain, and it is a no-op
// in local dev (localhost has no www). Set KEEP_WWW=true on a deployment whose
// canonical hostname really is the www one.
const keepWww = process.env.KEEP_WWW === "true";

app.use((req, res, next) => {
  const host = (req.headers.host || "").toLowerCase();

  if (keepWww || !host.startsWith("www.")) return next();

  // trust proxy is set above, so req.protocol reflects X-Forwarded-Proto and an
  // http://www hit is folded to https on the bare host in a single hop.
  const scheme = req.protocol === "http" ? "http" : "https";

  return res.redirect(301, `${scheme}://${host.slice(4)}${req.originalUrl}`);
});

// Security headers cover both the JSON API and the React build served below.
// Images may come from the configured product CDN, while scripts remain
// first-party only. Extra API/socket origins can be supplied by the host.
const cspConnectSources = [
  "'self'",
  "ws:",
  "wss:",
  ...(process.env.CSP_CONNECT_SRC || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
];
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: cspConnectSources,
        upgradeInsecureRequests:
          process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// Gzip responses. Reports, product lists and sales history are large JSON
// payloads; compressing them cuts transfer size ~70% and speeds every client.
app.use(compression());
const configuredOrigins = (
  process.env.CORS_ORIGIN || "https://advanced-inventory-management-system.vercel.app"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const localDevelopmentOrigins =
  process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:3000", "http://127.0.0.1:3000"];
const allowedOrigins = [...new Set([...configuredOrigins, ...localDevelopmentOrigins])];

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



// Socket.IO had no authentication at all: anyone who could reach the server
// could open a socket and receive every broadcast, including the full activity
// log — which the HTTP API deliberately gates behind activityLogAccess. The
// handshake carries the same httpOnly cookie the REST calls use (every client
// connects with withCredentials), so we verify it here and refuse the
// connection outright if it isn't a real session.
const jwt = require("jsonwebtoken");
const User = require("./models/Usermodel");

// Room for the people actually allowed to read the audit trail. Everyone else
// gets a payload-free nudge so their page can refetch through the REST endpoint,
// where the access rules are enforced.
const AUDIT_ROOM = "audit-trail";

const cookieFromHandshake = (raw, name) => {
  const found = (raw || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
};

io.use(async (socket, next) => {
  try {
    const token =
      cookieFromHandshake(socket.handshake.headers.cookie, "Inventorymanagmentsystem") ||
      socket.handshake.auth?.token;

    if (!token) return next(new Error("Unauthorized"));

    const decoded = jwt.verify(token, process.env.SecretKey || process.env.SECRETKEY);
    if (!decoded?.userId) return next(new Error("Unauthorized"));

    const user = await User.findById(decoded.userId).select("role logAccessUntil");
    if (!user) return next(new Error("Unauthorized"));

    socket.user = user;
    return next();
  } catch (error) {
    return next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  // Same rule as middleware/Authmiddleware.activityLogAccess: the owner always,
  // anyone else only inside an unexpired grant.
  const until = socket.user?.logAccessUntil;
  const mayReadAudit =
    socket.user?.role === "superadmin" ||
    (until && new Date(until).getTime() > Date.now());

  if (mayReadAudit) socket.join(AUDIT_ROOM);

  socket.on("disconnect", () => {
    // no-op; kept for parity with the previous handler
  });
})

app.set("auditRoom", AUDIT_ROOM);




app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// NoSQL-injection guard: strip any key that starts with "$" or contains a "."
// from user-supplied objects, recursively. Stops payloads like
// {"email": {"$gt": ""}} from ever reaching a Mongo query. Values are left
// untouched — only hostile KEYS are dropped — so normal requests are unaffected.
const stripUnsafeKeys = (value) => {
  if (Array.isArray(value)) {
    value.forEach(stripUnsafeKeys);
  } else if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (key.startsWith("$") || key.includes(".")) delete value[key];
      else stripUnsafeKeys(value[key]);
    }
  }
  return value;
};
app.use((req, _res, next) => {
  if (req.body) stripUnsafeKeys(req.body);
  if (req.params) stripUnsafeKeys(req.params);
  // req.query is a getter in Express 5-style routers; mutate its contents only.
  if (req.query) stripUnsafeKeys(req.query);
  next();
});

app.set("io", io);
app.use(cookieParser());

// Lightweight health check — used for uptime/warm-up pings (e.g. Render free tier).
app.get(["/health", "/api/health"], (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// Rate limiting. The health check sits above this and is never throttled
// (keep-alive pings hit it often).
//
// The limit is per IP, and that is the part worth understanding: every till in
// a shop sits behind the same broadband connection, so they all share ONE
// bucket. A four-till shop at the counter is a single IP spending requests for
// four cashiers at once — one barcode lookup per item scanned, plus the
// checkout itself, so a 20-item basket is ~21 requests on its own.
//
// Being throttled mid-sale is a real loss: the cashier cannot finish, in front
// of a customer, with a queue behind them. So the paths the till actually uses
// are held to a separate, far higher ceiling.
const TILL_PREFIXES = [
  "/api/pos",
  "/api/product",
  "/api/category",
  "/api/deal",
  "/api/voucher",
  "/api/store",
  // The website's SSR server calls this for every page render, all from one
  // IP, so it belongs on the high ceiling too — not the per-shopper cap.
  "/api/storefront",
];

// originalUrl, not path: this runs mounted at "/api", where req.path has
// already had the mount point stripped off.
const isTillTraffic = (req) =>
  TILL_PREFIXES.some((prefix) => req.originalUrl.startsWith(prefix));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 600, // per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTillTraffic, // the till answers to tillLimiter below instead
  message: { message: "Too many requests — please slow down and try again shortly." },
});

// The till's ceiling. Deliberately far above anything a shop full of cashiers
// can produce — this is not here to police normal trade, it is a backstop so a
// runaway client loop cannot exhaust the Mongo pool (maxPoolSize 20) and take
// the whole shop down. Every one of these routes requires a session, so an
// anonymous flood is refused by authmiddleware before it reaches a controller.
const tillLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.TILL_RATE_LIMIT_MAX) || 6000, // ~100 req/sec per shop
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
TILL_PREFIXES.forEach((prefix) => app.use(prefix, tillLimiter));
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
  // The online store: /api/online is the shop's own admin, /api/storefront is
  // what the website's server calls. Both read and write the SAME product
  // stock the till uses — see controller/onlineStoreController.js.
  app.use("/api/online", onlineAdminRouter);
  app.use("/api/storefront", storefrontRouter);
}

// Unknown API paths never fall through to the SPA, where a scanner could
// mistake the HTML shell for an exposed file or directory.
app.use("/api", (req, res) => {
  res.status(404).json({ message: "API endpoint not found" });
});

// Return JSON (not HTML) for upload/multer errors like oversized or non-image
// files, without reflecting internal errors or stack details to the caller.
app.use((err, req, res, next) => {
  if (err) {
    const uploadError = String(err.code || "").startsWith("LIMIT_");
    const status = Number(err.statusCode || err.status) || (uploadError ? 400 : 500);
    const message =
      status >= 500
        ? "Unexpected server error"
        : err.message || "The request could not be processed";
    return res.status(status).json({ message });
  }
  next();
});

// Full-stack single deployment: serve the built React app from the same server.
// The API lives under /api; every other path falls through to index.html so
// client-side routing works on refresh/deep links. If no build is present
// (API-only hosting) this is skipped.
//
// Look inside backend first (backend/client — where the deploy build lands so it
// travels with the backend folder to the runtime), then the local-dev location.
const clientBuild = [
  path.join(__dirname, "client"),
  path.join(__dirname, "..", "frontend", "build"),
].find((dir) => fs.existsSync(path.join(dir, "index.html")));

if (clientBuild) {
  const blockedPublicPath =
    /(?:^|\/)(?:\.git|\.env(?:\.[^/]*)?|node_modules|src|backend|frontend|online\.vapstore)(?:\/|$)|(?:^|\/)(?:package(?:-lock)?\.json|yarn\.lock|pnpm-lock\.yaml)$/i;

  app.use((req, res, next) => {
    if (req.path.endsWith(".map") || blockedPublicPath.test(req.path)) {
      res.set("X-Robots-Tag", "noindex, nofollow");
      return res.status(404).type("text/plain").send("Not found");
    }
    return next();
  });

  // Fingerprinted assets (main.<hash>.js, etc.) never change, so cache them hard
  // — repeat visitors and every till stop re-downloading them, cutting server
  // load. index.html is served by the catch-all below with no-cache so app
  // updates still show immediately. `index: false` keeps "/" out of here.
  app.use(
    express.static(clientBuild, {
      index: false,
      dotfiles: "deny",
      maxAge: "1y",
      immutable: true,
    })
  );
  // Every path the React router actually knows about. Anything not matching
  // gets a real 404 below.
  //
  // Without this list the catch-all answered 200 + index.html for literally any
  // URL, which meant every typo and every crawler-invented path looked like a
  // real page to Google — an unbounded set of URLs all serving identical
  // content. Serving the shell is still right for known deep links (a refresh
  // on /AdminDashboard/product has to work), but only for those.
  const CLIENT_ROUTES = [
    "/",
    "/about",
    "/LoginPage",
    "/pos",
    "/AdminDashboard",
    "/ManagerDashboard",
    "/SuperAdmin",
    "/StaffDashboard",
  ];

  // Only the landing page belongs in search results. Everything else is either
  // a sign-in form or a private console, and this header enforces that at the
  // HTTP level — it does not depend on the crawler running our JavaScript or
  // honouring robots.txt.
  const isPublic = (p) => p === "/" || p === "";

  const isKnownRoute = (p) =>
    CLIENT_ROUTES.some((route) =>
      route === "/" ? p === "/" : p === route || p.startsWith(`${route}/`)
    );

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();

    res.set("Cache-Control", "no-cache");

    if (!isKnownRoute(req.path)) {
      // Unknown path: tell crawlers it is gone, and still hand the SPA to
      // humans so the app can render its own not-found UI.
      res.set("X-Robots-Tag", "noindex, nofollow");
      return res.status(404).sendFile(path.join(clientBuild, "index.html"));
    }

    if (!isPublic(req.path)) {
      res.set("X-Robots-Tag", "noindex, nofollow");
    }

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

// Daily low-stock reminders. Runs on the real (MongoDB) server only. The sweep
// itself only emails a given product once per 24h, so running it hourly just
// makes the "24h" boundary responsive without spamming — each low product still
// gets at most one email per day, plus the immediate one when it first goes low.
// Make sure the "Miscellaneous" catch-all category exists before the first
// sale. It is what a cashier picks when a scanned item is new and they don't
// know where it belongs, and the till pins it to the front of the category
// tiles — so it needs to be there from the start, not only after someone has
// already quick-added something. Idempotent: a no-op once it exists.
if (!useLocalStorage) {
  const { ensureMiscCategory } = require("./controller/productController");
  setTimeout(() => {
    ensureMiscCategory()
      .then((category) => console.log(`[catalogue] "${category.name}" category ready`))
      .catch((err) => console.warn(`[catalogue] misc category failed: ${err.message}`));
  }, 5 * 1000);
}

if (!useLocalStorage) {
  const { remindLowStock } = require("./controller/reorderController");
  const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly check; per-product 24h cap inside
  setTimeout(() => remindLowStock(), 60 * 1000); // once, ~1 min after boot
  setInterval(() => remindLowStock(), SWEEP_INTERVAL_MS);
  console.log("[reorder] low-stock reminder sweep scheduled (hourly, 24h per product)");
}

module.exports = { io, server};
