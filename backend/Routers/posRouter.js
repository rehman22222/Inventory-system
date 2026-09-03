const express = require("express");
const {
  checkout,
  refund,
  voidSale,
  getReceipts,
  getAllSales,
  getReceipt,
  emailReceipt,
  getRefunds,
  getCredits,
  recordCreditPayment,
  releaseRefundCredit,
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
  reportAccess,
  tillUser,
} = require("../middleware/Authmiddleware");

const router = express.Router();

router.post("/checkout", authmiddleware, checkout);

// The till flushes sales it rang up with no network. Idempotent on clientRef,
// so a dropped connection can safely replay the whole queue.
router.post("/sync", authmiddleware, syncOfflineSales);

// Money back over the counter. Open to whoever is on the till — the shop runs
// one POS for every role — and recorded against them by name either way.
router.post("/refund", authmiddleware, tillUser, refund);
// The counter's own record of what went back out. Same scope rule as the sale
// history: a cashier sees their own, the owner side sees everything.
router.get("/refunds", authmiddleware, tillUser, getRefunds);
router.post("/void/:receiptNo", authmiddleware, tillUser, voidSale);
// An exchange that was never rung up: give the customer the money the refund
// held back for it.
router.post(
  "/refund/:reference/release",
  authmiddleware,
  tillUser,
  releaseRefundCredit,
);

// The credit book: what is still owed, and taking money against it. Open to
// whoever is on the till — a customer settling up should not have to come
// back when a particular person is on.
router.get("/credits", authmiddleware, tillUser, getCredits);
router.post(
  "/receipt/:receiptNo/credit-payment",
  authmiddleware,
  tillUser,
  recordCreditPayment,
);

router.get("/receipts", authmiddleware, getReceipts);
// Report dashboard: the whole shop's sales, unscoped. Dedicated report account only.
router.get("/all-sales", authmiddleware, reportAccess, getAllSales);
router.get("/receipt/:receiptNo", authmiddleware, getReceipt);
// Emailing a receipt is the paperless version of printing it, so it is open to
// whoever can ring up the sale — the same scope rule inside decides which
// receipts they are allowed to reach.
router.post("/receipt/:receiptNo/email", authmiddleware, emailReceipt);
// Correcting a mis-tapped tender (cash -> card) on a still-open sale. Ownership
// and the day-closing lock are enforced in the controller.
router.patch("/receipt/:receiptNo/payment", authmiddleware, changePaymentMethod);

// Day closing: a cashier previews and closes their OWN takings...
router.get("/day-closing/summary", authmiddleware, dayClosingSummary);
router.post("/day-closing/close", authmiddleware, closeDay);
// ...and once handed over, the batch reads back UP THE CHAIN: a manager sees
// their staff's (and own) closings, the owner side sees all. The controller
// scopes the results by role, so the route only needs auth.
router.get("/day-closings", authmiddleware, getDayClosings);
router.get("/day-closings/:closingId", authmiddleware, getDayClosing);

router.post("/hold", authmiddleware, holdSale);
router.get("/held", authmiddleware, getHeldSales);
router.delete("/held/:heldId", authmiddleware, deleteHeldSale);

module.exports = router;
