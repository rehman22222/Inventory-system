const mongoose = require("mongoose");

// A request raised by an admin for an action they are not allowed to perform
// directly. The superadmin approves it (which executes the action) or rejects
// it. New action types just add a case in the approval controller's executor.
const ApprovalRequestSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },

    type: {
      type: String,
      enum: [
        "create_user",
        "delete_user",
        "create_supplier",
        "create_deal",
        // Not an action but an access grant: approving opens the audit trail to
        // the requester for a while. See ACTIVITY_LOG_GRANT_HOURS.
        "view_activity_logs",
      ],
      required: true,
    },

    // Human-readable one-liner for the queue ("Create staff account for Sam").
    summary: { type: String },

    // Action-specific data. For create_user the password is stored only until
    // the request is decided, then cleared.
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },

    reason: { type: String },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "failed"],
      default: "pending",
    },

    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    requestedByName: { type: String },

    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    decidedByName: { type: String },
    decidedAt: { type: Date },
    decisionNote: { type: String },

    // What the approval produced (e.g. the created user id) or why it failed.
    resultRef: { type: mongoose.Schema.Types.ObjectId },
    resultNote: { type: String },
  },
  { timestamps: true }
);

const ApprovalRequest = mongoose.model("ApprovalRequest", ApprovalRequestSchema);

module.exports = ApprovalRequest;
