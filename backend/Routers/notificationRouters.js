const express = require("express");
const router = express.Router();
const {createNotification,getAllNotifications,getUnreadNotifications,markAsRead,deleteNotification}= require("../controller/notificationcontroller");
const { authmiddleware, adminOrManager, adminOrSuperadmin } = require("../middleware/Authmiddleware");

// These routes had no auth at all. createNotification also broadcasts over
// Socket.IO, so an anonymous caller could push arbitrary text onto every screen
// in the shop. Roles below mirror the pages that actually use them:
// Notificationpage is admin/superadmin, NotificationPageRead is manager.

// Writing and removing notices is the owner side's (Notificationpage).
router.post("/createNotification", authmiddleware, adminOrSuperadmin, createNotification);
router.delete("/deleteNotification/:id/", authmiddleware, adminOrSuperadmin, deleteNotification);

// Reading them includes the manager's read-only view.
router.get("/allNotification", authmiddleware, adminOrManager, getAllNotifications);
router.get("/unreadNotification", authmiddleware, adminOrManager, getUnreadNotifications);
router.put("/:id/readNotification", authmiddleware, adminOrManager, markAsRead);

module.exports = router;
