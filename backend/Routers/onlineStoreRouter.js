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
  bulkVariantQuantity,
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
  ordersReport,
  updateOrderStatus,
  salesSummary,
  listNewsletterSubscribers,
  newsletterReport,
  listReviews,
  updateReview,
  deleteReview,
  storefrontCatalog,
  storefrontCategories,
  storefrontSettings,
  storefrontProducts,
  storefrontProduct,
  storefrontProductReviews,
  storefrontReviewContext,
  submitStorefrontReview,
  storefrontHero,
  validateStorefrontVoucher,
  placeOrder,
  subscribeNewsletter,
  submitContactMessage,
  listBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  storefrontBlogPosts,
  storefrontBlogPost,
} = require("../controller/onlineStoreController");
const {
  catalogue,
  importCategories,
  uploadListingImage,
  createInventoryProduct,
  storefrontLoyaltyQuote,
} = require("../controller/onlineStoreController");
const {
  // Storefront — the shopper's own account
  register,
  verifyRegistration,
  login,
  me,
  updateProfile,
  changePassword,
  saveAddress,
  deleteAddress,
  myOrders,
  myOrder,
  myRewards,
  forgotPassword,
  resetPassword,
  // Admin — the shop's view of its customers and its rewards programme
  listCustomers,
  getCustomer,
  setCustomerStatus,
  adjustPoints,
  recalculatePoints,
  listLoyaltyRules,
  createLoyaltyRule,
  updateLoyaltyRule,
  deleteLoyaltyRule,
} = require("../controller/onlineCustomerController");
const {
  authmiddleware,
  adminOrSuperadmin,
  blogEditorAccess,
  customerAuth,
  optionalCustomerAuth,
} = require("../middleware/Authmiddleware");
const { upload } = require("../middleware/upload");
const {
  storefrontBlogComments,
  submitBlogComment,
  listBlogComments,
  setBlogCommentStatus,
  deleteBlogComment,
} = require("../controller/onlineBlogCommentController");

/* Which comments appear on the website is the shop's own call: admins and the
 * super admin only. The admin router's guard also lets the website specialist
 * (seo_store) in to run the store console; this narrows it back for comments. */
const commentModerators = (req, res, next) => {
  if (req.user?.role === "admin" || req.user?.role === "superadmin") return next();
  return res.status(403).json({ message: "Only an admin or the super admin can moderate comments." });
};

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
// Create a new inventory product inline (e.g. a brand-new flavour/colour).
adminRouter.post("/inventory-products", createInventoryProduct);
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
adminRouter.patch("/listings/:id/stock", bulkVariantQuantity);
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
adminRouter.get("/orders/report", ordersReport);
adminRouter.patch("/orders/:id/status", updateOrderStatus);

adminRouter.get("/newsletter", listNewsletterSubscribers);
adminRouter.get("/newsletter/report", newsletterReport);

adminRouter.get("/reviews", listReviews);
adminRouter.patch("/reviews/:id", updateReview);
adminRouter.delete("/reviews/:id", deleteReview);

adminRouter.get("/blog-comments", commentModerators, listBlogComments);
adminRouter.patch("/blog-comments/:id", commentModerators, setBlogCommentStatus);
adminRouter.delete("/blog-comments/:id", commentModerators, deleteBlogComment);

/* The people who shop on the website, and what the shop owes them.
 *
 * Read-heavy by design: the shop can look at anything, block an account and
 * move a balance by hand, but it cannot sign in as somebody, cannot read a
 * password (there is nothing to read — only a hash) and cannot edit anybody's
 * order history. */
adminRouter.get("/customers", listCustomers);
adminRouter.get("/customers/:id", getCustomer);
adminRouter.patch("/customers/:id/status", setCustomerStatus);
// The one route that can create points out of nothing. Logged, signed with the
// name of whoever did it, and the reason is shown to the customer.
adminRouter.post("/customers/:id/points", adjustPoints);
// Put a drifted cache back in step with the ledger.
adminRouter.post("/customers/:id/recalculate", recalculatePoints);

// The rewards programme's own rules — "double points on e-liquid", "200 points
// on this kit", "spend €50, get 100". The base rate lives in Settings.
adminRouter.get("/loyalty/rules", listLoyaltyRules);
adminRouter.post("/loyalty/rules", createLoyaltyRule);
adminRouter.put("/loyalty/rules/:id", updateLoyaltyRule);
adminRouter.delete("/loyalty/rules/:id", deleteLoyaltyRule);

/* ── Blog router — /api/online/blog ──────────────────────────────────────────
 * Mounted at /api/online alongside the admin router, but with its own, wider
 * guard. This is the one part of the website's back office that somebody who
 * does not work in the shop can be given.
 *
 * It is a separate router rather than four routes inside the admin one because
 * the admin router applies `adminOrSuperadmin` to everything under it in a
 * single `.use()`. Carving an exception out of that would mean the blog's
 * permissions depended on where its routes sat in the file — true today,
 * quietly untrue after somebody moves a line. A different guard belongs on a
 * different router.
 *
 * server.js mounts this BEFORE the admin router so /blog is matched here.
 *
 * Note what is NOT here: settings, listings, orders, customers. A content
 * account writes articles and uploads pictures for them. The blog landing
 * page's own headings stay with the shop, in Settings.
 * ------------------------------------------------------------------------- */
const blogRouter = express.Router();
blogRouter.use(authmiddleware, blogEditorAccess);

blogRouter.get("/blog", listBlogPosts);
blogRouter.post("/blog", createBlogPost);
blogRouter.put("/blog/:id", updateBlogPost);
blogRouter.delete("/blog/:id", deleteBlogPost);
// Article artwork. Same handler and same Cloudinary folder as product
// photography — the difference is only who is allowed to call it.
blogRouter.post("/blog/upload", upload.array("images", 8), uploadListingImage);

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

storefrontRouter.get("/catalog", storefrontCatalog);
storefrontRouter.get("/categories", storefrontCategories);
storefrontRouter.get("/settings", storefrontSettings);
storefrontRouter.get("/products", storefrontProducts);
storefrontRouter.get("/products/:slug", storefrontProduct);
storefrontRouter.get("/products/:slug/reviews", storefrontProductReviews);
storefrontRouter.get("/reviews/context", storefrontReviewContext);
storefrontRouter.post("/reviews", submitStorefrontReview);
storefrontRouter.get("/hero", storefrontHero);
storefrontRouter.post("/vouchers/validate", validateStorefrontVoucher);
// Checkout knows who is buying when they are signed in — for the address it
// prefills, the points it spends and the points it awards — but never REQUIRES
// it. An expired token has to hand somebody a guest checkout, not an error page
// with a full basket behind it.
storefrontRouter.post("/orders", optionalCustomerAuth, placeOrder);
// "What will this basket earn, and how much of my balance can I put against
// it?" Read-only; every figure is recomputed for real when the order is placed.
storefrontRouter.post("/loyalty/quote", optionalCustomerAuth, storefrontLoyaltyQuote);

/* ── The shopper's own account ───────────────────────────────────────────────
 * Everything below identifies the customer from their token and nothing else.
 * No route here takes a customer id from the caller, because an id that arrives
 * in a request is an id that can be changed in a request.
 *
 * These sit behind the storefront key like the rest of this router, so they are
 * reachable only from the website's own server — a shopper's browser never
 * talks to this API directly.
 * ------------------------------------------------------------------------- */
storefrontRouter.post("/account/register", register);
storefrontRouter.post("/account/register/verify", verifyRegistration);
storefrontRouter.post("/account/login", login);
storefrontRouter.post("/account/forgot-password", forgotPassword);
storefrontRouter.post("/account/reset-password", resetPassword);

storefrontRouter.get("/account/me", customerAuth, me);
storefrontRouter.put("/account/profile", customerAuth, updateProfile);
storefrontRouter.put("/account/password", customerAuth, changePassword);

storefrontRouter.post("/account/addresses", customerAuth, saveAddress);
storefrontRouter.put("/account/addresses/:addressId", customerAuth, saveAddress);
storefrontRouter.delete("/account/addresses/:addressId", customerAuth, deleteAddress);

storefrontRouter.get("/account/orders", customerAuth, myOrders);
storefrontRouter.get("/account/orders/:orderNo", customerAuth, myOrder);
storefrontRouter.get("/account/rewards", customerAuth, myRewards);
storefrontRouter.post("/newsletter", subscribeNewsletter);
storefrontRouter.post("/contact", submitContactMessage);
storefrontRouter.get("/blog", storefrontBlogPosts);
storefrontRouter.get("/blog/:slug", storefrontBlogPost);
storefrontRouter.get("/blog/:slug/comments", storefrontBlogComments);
// Signed-in readers comment as their account; guests give a name and email.
storefrontRouter.post("/blog/:slug/comments", optionalCustomerAuth, submitBlogComment);

module.exports = { adminRouter, blogRouter, storefrontRouter };
