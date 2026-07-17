const mongoose = require("mongoose");
const logger=require('../libs/logger')


const ActivityLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
    
    },
    description: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, 
    },
    entity: {
      type: String,
      required: true,
      enum: ["product", "category", "order", "user", "system", "voucher"],
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false, 
    },
    ipAddress: {
        type: String,
        required: false,
      },
    
  },
  { timestamps: true }

);







// The activity log is append-heavy and read newest-first, often scoped to one
// user or a date window (the admin grant). Index the sort key and the per-user
// timeline so the audit page stays fast as the log grows into the tens of
// thousands of rows.
ActivityLogSchema.index({ createdAt: -1 });
ActivityLogSchema.index({ userId: 1, createdAt: -1 });

const ActivityLog = mongoose.model("ActivityLog", ActivityLogSchema);

module.exports = ActivityLog;
