const mongoose = require("mongoose");

// A support ticket raised by a shop admin and answered by the vendor
// (superadmin). This is the only channel between the two roles.
const ReplySchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    byName: { type: String },
    byRole: { type: String },
    message: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const TicketSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },

    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true },

    category: {
      type: String,
      enum: ["bug", "feature", "billing", "question", "other"],
      default: "question",
    },
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
    },
    status: {
      type: String,
      enum: ["open", "in-progress", "resolved", "closed"],
      default: "open",
    },

    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    raisedByName: { type: String },
    raisedByEmail: { type: String },

    replies: [ReplySchema],

    // Set when the vendor last answered, so an admin can see they were heard.
    lastRepliedAt: { type: Date },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

const Ticket = mongoose.model("Ticket", TicketSchema);

module.exports = Ticket;
