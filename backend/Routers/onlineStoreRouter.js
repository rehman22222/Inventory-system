const express = require("express");
const {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listListings,
  upsertListing,
  updateListing,
  toggleListing,
  deleteListing,
  listVouchers,
  createVoucher,
  updateVoucher,
  deleteVoucher,
  getStoreSettings,
  updateStoreSettings,
  listHeroSlides,
  createHeroSlide,
  updateHeroSlide,
  deleteHeroSlide,
  listOrders,
  updateOrderStatus,
  salesSummary,
  storefrontCategories,
  storefrontSettings,
  storefrontProducts,
  storefrontProduct,
  storefrontHero,
  validateStorefrontVoucher,
  placeOrder,
} = require("../controller/onlineStoreController");
const {
  catalogue,
  importCategories,
  uploadListingImage,
} = require("../controller/onlineStoreController");
const {
  authmiddleware,
  adminOrSuperadmin,
} = require("../middleware/Authmiddleware");
const { upload } = require("../middleware/upload");

/* ── Admin router — /api/online ──────────────────────────────────────────────
 * Everything the shop's own people use to run the website: what is listed,
 * how it is presented, the order queue and the takings. Same role guard as the
 * rest of the owner side.
 * ------------------------------------------------------------------------- */
const adminRouter = express.Router();
adminRouter.use(authmiddleware, adminOrSuperadmin);

adminRouter.get("/summary", salesSummary);

// The "Add product" picker: the whole inventory, searchable and filterable.
adminRouter.get("/catalogue", catalogue);
// Web-only photography, uploaded to its own Cloudinary folder.
adminRouter.post("/upload", upload.array("images", 8), uploadListingImage);

adminRouter.get("/categories", listCategories);
adminRouter.post("/categories", createCategory);
// Mirror the till's categories onto the website in one action.
adminRouter.post("/categories/import", importCategories);
adminRouter.put("/categories/:id", updateCategory);
adminRouter.delete("/categories/:id", deleteCategory);

adminRouter.get("/listings", listListings);
adminRouter.post("/listings", upsertListing);
adminRouter.put("/listings/:id", updateListing);
adminRouter.patch("/listings/:id/toggle", toggleListing);
adminRouter.delete("/listings/:id", deleteListing);

adminRouter.get("/vouchers", listVouchers);
adminRouter.post("/vouchers", createVoucher);
adminRouter.put("/vouchers/:id", updateVoucher);
adminRouter.delete("/vouchers/:id", deleteVoucher);

adminRouter.get("/settings", getStoreSettings);
adminRouter.put("/settings", updateStoreSettings);

adminRouter.get("/hero", listHeroSlides);
adminRouter.post("/hero", createHeroSlide);
adminRouter.put("/hero/:id", updateHeroSlide);
adminRouter.delete("/hero/:id", deleteHeroSlide);

adminRouter.get("/orders", listOrders);
adminRouter.patch("/orders/:id/status", updateOrderStatus);

/* ── Storefront router — /api/storefront ─────────────────────────────────────
 * Called server-to-server by the website's SSR layer, never from a shopper's
 * browser. A shared key stands in for a session.
 *
 * Fail-closed in production: if STOREFRONT_API_KEY is not configured the
 * storefront endpoints are switched off rather than left open. Outside
 * production they stay reachable so the site can be run locally.
 * ------------------------------------------------------------------------- */
const storefrontRouter = express.Router();

const storefrontAuth = (req, res, next) => {
  const configured = process.env.STOREFRONT_API_KEY;
  const presented = req.headers["x-storefront-key"];

  if (configured) {
    if (presented === configured) return next();
    return res
      .status(401)
      .json({ message: "Unauthorized: bad storefront key." });
  }

  if (process.env.NODE_ENV === "production") {
    return res.status(503).json({
      message:
        "The storefront API is not configured. Set STOREFRONT_API_KEY on the server.",
    });
  }

  return next(); // local development
};

storefrontRouter.use(storefrontAuth);

storefrontRouter.get("/categories", storefrontCategories);
storefrontRouter.get("/settings", storefrontSettings);
storefrontRouter.get("/products", storefrontProducts);
storefrontRouter.get("/products/:slug", storefrontProduct);
storefrontRouter.get("/hero", storefrontHero);
storefrontRouter.post("/vouchers/validate", validateStorefrontVoucher);
storefrontRouter.post("/orders", placeOrder);

module.exports = { adminRouter, storefrontRouter };
