const express = require("express");
const {
  checkout,
  refund,
  voidSale,
  getReceipts,
  getAllSales,
  getReceipt,
  changePaymentMethod,
  syncOfflineSales,
  dayClosingSummary,
  closeDay,
  getDayClosings,
  getDayClosing,
  holdSale,
  getHeldSales,
  deleteHeldSale,
} = require("../controller/posController");
const {
  authmiddleware,
  adminOrManager,
  adminOrSuperadmin,
  superadminmiddleware,
} = require("../middleware/Authmiddleware");

const router = express.Router();

router.post("/checkout", authmiddleware, checkout);

// The till flushes sales it rang up with no network. Idempotent on clientRef,
// so a dropped connection can safely replay the whole queue.
router.post("/sync", authmiddleware, syncOfflineSales);

// Money back over the counter is an elevated action.
router.post("/refund", authmiddleware, adminOrManager, refund);
router.post("/void/:receiptNo", authmiddleware, adminOrManager, voidSale);

router.get("/receipts", authmiddleware, getReceipts);
// Ghost mode: the whole shop's sales, unscoped. Owner only.
router.get("/all-sales", authmiddleware, superadminmiddleware, getAllSales);
router.get("/receipt/:receiptNo", authmiddleware, getReceipt);
// Correcting a mis-tapped tender (cash -> card) on a still-open sale. Ownership
// and the day-closing lock are enforced in the controller.
router.patch("/receipt/:receiptNo/payment", authmiddleware, changePaymentMethod);

// Day closing: a cashier previews and closes their OWN takings...
router.get("/day-closing/summary", authmiddleware, dayClosingSummary);
router.post("/day-closing/close", authmiddleware, closeDay);
// ...and once handed over, only the owner side can read the batch back.
router.get("/day-closings", authmiddleware, adminOrSuperadmin, getDayClosings);
router.get("/day-closings/:closingId", authmiddleware, adminOrSuperadmin, getDayClosing);

router.post("/hold", authmiddleware, holdSale);
router.get("/held", authmiddleware, getHeldSales);
router.delete("/held/:heldId", authmiddleware, deleteHeldSale);

module.exports = router;
