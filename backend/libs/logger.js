const ActivityLog = require("../models/ActivityLogmodel");

const MAX_USER_AGENT = 300;

const logActivity = async ({ action, description, entity, entityId, userId, ipAddress, userAgent, changes }) => {
  try {
    const newActivity = new ActivityLog({
      action,
      description,
      entity,
      entityId,
      userId,
      ipAddress,
      userAgent: userAgent ? String(userAgent).slice(0, MAX_USER_AGENT) : undefined,
      changes: Array.isArray(changes) && changes.length ? changes : undefined,
    });

    await newActivity.save();
  } catch (error) {
    console.error("Error logging activity:", error);
  }
};

module.exports = logActivity;
