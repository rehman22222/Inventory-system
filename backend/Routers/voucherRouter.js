const express = require("express");
const {
  createVoucher,
  getVouchers,
  getActiveVouchers,
  disableVoucher,
  removeVoucher,
  validateVoucher,
} = require("../controller/voucherController");
const {
  authmiddleware,
  adminOrManager,
  tillUser,
} = require("../middleware/Authmiddleware");

const router = express.Router();

// Writing a voucher at the counter is part of the one till every role shares —
// a customer owed a gesture should not have to wait for a manager to walk over.
router.post("/create", authmiddleware, tillUser, createVoucher);

// Reading and revoking the whole book is still back-office work, and nothing on
// the till needs it.
router.get("/all", authmiddleware, adminOrManager, getVouchers);
router.put("/:voucherId/disable", authmiddleware, adminOrManager, disableVoucher);
router.delete("/:voucherId", authmiddleware, adminOrManager, removeVoucher);

// Any cashier at the till can check a code a customer hands them. POST because
// the computed discount depends on the cart subtotal sent in the body.
router.post("/validate", authmiddleware, validateVoucher);

// The till caches this so vouchers still work when the line drops.
router.get("/active", authmiddleware, getActiveVouchers);

module.exports = router;
