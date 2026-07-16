const express = require("express");
const {
  createDeal,
  getDeals,
  updateDeal,
  removeDeal,
} = require("../controller/dealController");
const { authmiddleware, adminOrManager } = require("../middleware/Authmiddleware");

const router = express.Router();

// Any signed-in cashier reads active deals so the till can detect them.
router.get("/all", authmiddleware, getDeals);

// Building and editing deals is an admin/manager job.
router.post("/create", authmiddleware, adminOrManager, createDeal);
router.put("/:dealId", authmiddleware, adminOrManager, updateDeal);
router.delete("/:dealId", authmiddleware, adminOrManager, removeDeal);

module.exports = router;
