const express = require("express");
const {
  createDeal,
  getDeals,
  updateDeal,
  removeDeal,
} = require("../controller/dealController");
const {
  authmiddleware,
  adminOrManager,
  superadminmiddleware,
} = require("../middleware/Authmiddleware");

const router = express.Router();

// Any signed-in cashier reads active deals so the till can detect them.
router.get("/all", authmiddleware, getDeals);

// Creating a deal gives money away, so it is the owner's call. Admin and
// manager raise an approval request (type: create_deal) and the superadmin's
// approval is what creates it.
router.post("/create", authmiddleware, superadminmiddleware, createDeal);

// Pausing, editing and removing an existing deal stays with admin/manager —
// they need to be able to stop one immediately.
router.put("/:dealId", authmiddleware, adminOrManager, updateDeal);
router.delete("/:dealId", authmiddleware, adminOrManager, removeDeal);

module.exports = router;
