const express = require("express");
const {
  createVoucher,
  getVouchers,
  getActiveVouchers,
  disableVoucher,
  removeVoucher,
  validateVoucher,
} = require("../controller/voucherController");
const { authmiddleware, adminOrManager } = require("../middleware/Authmiddleware");

const router = express.Router();

// Managing vouchers is an admin/manager job.
router.post("/create", authmiddleware, adminOrManager, createVoucher);
router.get("/all", authmiddleware, adminOrManager, getVouchers);
router.put("/:voucherId/disable", authmiddleware, adminOrManager, disableVoucher);
router.delete("/:voucherId", authmiddleware, adminOrManager, removeVoucher);

// Any cashier at the till can check a code a customer hands them. POST because
// the computed discount depends on the cart subtotal sent in the body.
router.post("/validate", authmiddleware, validateVoucher);

// The till caches this so vouchers still work when the line drops.
router.get("/active", authmiddleware, getActiveVouchers);

module.exports = router;
