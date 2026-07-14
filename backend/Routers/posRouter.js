const express = require("express");
const {
  checkout,
  refund,
  voidSale,
  getReceipts,
  getReceipt,
  holdSale,
  getHeldSales,
  deleteHeldSale,
} = require("../controller/posController");
const { authmiddleware, adminOrManager } = require("../middleware/Authmiddleware");

const router = express.Router();

router.post("/checkout", authmiddleware, checkout);

// Money back over the counter is an elevated action.
router.post("/refund", authmiddleware, adminOrManager, refund);
router.post("/void/:receiptNo", authmiddleware, adminOrManager, voidSale);

router.get("/receipts", authmiddleware, getReceipts);
router.get("/receipt/:receiptNo", authmiddleware, getReceipt);

router.post("/hold", authmiddleware, holdSale);
router.get("/held", authmiddleware, getHeldSales);
router.delete("/held/:heldId", authmiddleware, deleteHeldSale);

module.exports = router;
