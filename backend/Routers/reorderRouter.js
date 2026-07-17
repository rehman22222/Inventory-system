const express = require("express");
const router = express.Router();
const {
  getReorders,
  updateReorder,
  approveReorder,
  rejectReorder,
} = require("../controller/reorderController");
const { authmiddleware, adminOrSuperadmin } = require("../middleware/Authmiddleware");

// Reorders are an owner/admin concern — the people who decide what to buy and
// authorise the supplier email. Managers and staff don't see this queue.
router.get("/", authmiddleware, adminOrSuperadmin, getReorders);
router.put("/:id", authmiddleware, adminOrSuperadmin, updateReorder);
router.post("/:id/approve", authmiddleware, adminOrSuperadmin, approveReorder);
router.post("/:id/reject", authmiddleware, adminOrSuperadmin, rejectReorder);

module.exports = router;
