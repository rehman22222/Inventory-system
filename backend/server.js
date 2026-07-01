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
    methods: ["GET", "POST","PUT","DELETE"],
    credentials: true,
  },
});

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE"],
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



module.exports = { io, server};
