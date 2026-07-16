const express = require("express");
const {
  createRequest,
  getRequests,
  getMyRequests,
  approveRequest,
  rejectRequest,
} = require("../controller/approvalController");
const {
  authmiddleware,
  adminmiddleware,
  superadminmiddleware,
} = require("../middleware/Authmiddleware");

const router = express.Router();

// Admin raises and tracks their own requests.
router.post("/request", authmiddleware, adminmiddleware, createRequest);
router.get("/mine", authmiddleware, adminmiddleware, getMyRequests);

// Superadmin reviews the queue and decides.
router.get("/", authmiddleware, superadminmiddleware, getRequests);
router.post("/:requestId/approve", authmiddleware, superadminmiddleware, approveRequest);
router.post("/:requestId/reject", authmiddleware, superadminmiddleware, rejectRequest);

module.exports = router;
