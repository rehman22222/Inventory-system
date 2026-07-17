const express = require("express");
const router = express.Router();
const ActivityLog = require("../models/ActivityLogmodel");
const {
  authmiddleware,
  superadminmiddleware,
  activityLogAccess,
} = require("../middleware/Authmiddleware");

module.exports = (app) => {
  const io = app.get("io");

  if (!io) {
    console.error("Socket.IO is not initialized! Make sure app.set('io', io) is called.");
    return router;
  }

  io.on("connection", (socket) => {
    console.log("A user connected");

    socket.on("disconnect", () => {
      console.log("User disconnected");
    });
  });

  const emitNewLog = async (logId) => {
    try {
      const log = await ActivityLog.findById(logId).populate("userId").select("-password");
      io.emit("newActivityLog", log);
    } catch (error) {
      console.error("Error emitting new log:", error);
    }
  };

  // Writing straight into the audit trail was open to anyone. Entries are meant
  // to come from libs/logger on the server, so this is now the owner's alone.
  router.post('/addLog', authmiddleware, superadminmiddleware, async (req, res) => {
    try {
      const newLog = new ActivityLog(req.body);
      const savedLog = await newLog.save();
      console.log("Saved log:", savedLog);
      emitNewLog(savedLog._id);

      res.status(201).json(savedLog);
    } catch (error) {
      console.error("Error creating activity log:", error);
      res.status(500).json({ message: "Error creating activity log", error: error.message });
    }
  });

  // The audit trail an admin was granted is exactly the window they asked for.
  // The superadmin sees everything. Enforced here, not in the UI, so the range
  // can't be widened by editing a query param.
  const grantedRange = (user) => {
    if (user.role === "superadmin") return {};
    const filter = {};
    if (user.logAccessFrom || user.logAccessTo) {
      filter.createdAt = {};
      if (user.logAccessFrom) filter.createdAt.$gte = new Date(user.logAccessFrom);
      if (user.logAccessTo) filter.createdAt.$lte = new Date(user.logAccessTo);
    }
    return filter;
  };

  router.get('/getAllLogs', authmiddleware, activityLogAccess, async (req, res) => {
    try {
      const logs = await ActivityLog.find(grantedRange(req.user))
        .populate("userId")
        .sort({ createdAt: -1 })
        .limit(5000);

      res.status(200).json({
        logs,
        // The window the caller is looking at, so the page can label it.
        range: req.user.role === "superadmin"
          ? null
          : { from: req.user.logAccessFrom, to: req.user.logAccessTo, until: req.user.logAccessUntil },
      });
    } catch (error) {
      console.error("Failed to fetch logs:", error);
      res.status(500).json({ message: "Failed to fetch logs", error: error.message });
    }
  });

  
  // The dashboard's three-line "recent activity" strip. Left open to any
  // signed-in user (it had no auth at all before) rather than gated: it is a
  // glance at the shop, not the audit trail. Gate it here too if that changes.
  router.get("/getrecentActivitys", authmiddleware, async(req,res)=>{
    try{
      const logs=await ActivityLog.find().sort({createdAt: -1}).limit(3);
      res.status(200).json(logs);
    }
    catch(error){
      console.error("Failed to fetch logs:", error);
      res.status(500).json({ message: "Failed to fetch logs", error: error.message });
    
    }
  })

  router.get('/getLogs/:userid', authmiddleware, activityLogAccess, async (req, res) => {
    const { userid } = req.params;
    try {
      const logs = await ActivityLog.find({ userId: userid, ...grantedRange(req.user) }).sort({
        createdAt: -1,
      });
      res.status(200).json(logs);
    } catch (error) {
      console.error("Failed to fetch logs for user:", userid, error);
      res.status(500).json({ message: "Failed to fetch logs", error: error.message });
    }
  });

  // An audit trail anyone can delete from is not an audit trail. Owner only.
  router.delete('/deleteLog', authmiddleware, superadminmiddleware, async (req, res) => {
    try {
      const { id } = req.body;
      const deletedLog = await ActivityLog.findByIdAndDelete(id);

      if (!deletedLog) {
        return res.status(404).json({ message: "Log not found" });
      }

      res.status(200).json({ message: "Log deleted successfully", deletedLog });
    } catch (error) {
      console.error("Failed to delete log:", error);
      res.status(500).json({ message: "Failed to delete log", error: error.message });
    }
  });

  return router;
};