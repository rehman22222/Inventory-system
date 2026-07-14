const express = require("express");
const {
  createTicket,
  getTickets,
  getTicket,
  replyToTicket,
  updateStatus,
} = require("../controller/ticketController");
const {
  authmiddleware,
  adminOrSuperadmin,
  superadminmiddleware,
} = require("../middleware/Authmiddleware");

const router = express.Router();

// Shop admins raise and follow their own tickets; the vendor sees them all.
router.post("/create", authmiddleware, adminOrSuperadmin, createTicket);
router.get("/", authmiddleware, adminOrSuperadmin, getTickets);
router.get("/:ticketId", authmiddleware, adminOrSuperadmin, getTicket);
router.post("/:ticketId/reply", authmiddleware, adminOrSuperadmin, replyToTicket);

// Only the vendor closes the loop.
router.put("/:ticketId/status", authmiddleware, superadminmiddleware, updateStatus);

module.exports = router;
