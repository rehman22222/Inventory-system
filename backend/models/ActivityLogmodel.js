const mongoose = require("mongoose");

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
      enum: [
        "product",
        "category",
        "order",
        "user",
        "system",
        "voucher",
        "onlineCategory",
        "onlineListing",
        "onlineOrder",
        // A website customer's account, and the rewards rules the shop writes.
        // Both are things staff can change on somebody else's behalf, so both
        // have to be nameable here — an audit trail that cannot record an
        // action is one that quietly loses it.
        "onlineCustomer",
        "loyaltyRule",
        // A sale taken out of the books by the superadmin. This is the one
        // action here that MOVES MONEY on every report the shop has, so it
        // is the last one that should be missing from the trail — and it
        // was: logActivity swallows its own errors, so an entity it could
        // not name was dropped without a word.
        "sale",
      ],
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
    },
    ipAddress: {
      type: String,
      required: false,
    },
    // The browser/device the action came from. An IP alone cannot tell a
    // manager's phone from a stranger's laptop on the same network.
    userAgent: {
      type: String,
      required: false,
    },
    // What an edit actually did, field by field (see libs/auditDiff). Empty on
    // entries that are not edits, and on every entry written before this
    // existed — those only ever said "was updated".
    changes: {
      type: [
        {
          _id: false,
          field: { type: String, required: true },
          from: { type: mongoose.Schema.Types.Mixed },
          to: { type: mongoose.Schema.Types.Mixed },
        },
      ],
      default: undefined,
    },
  },
  { timestamps: true }
);

// The activity log is append-heavy and read newest-first, often scoped to one
// user or a date window (the admin grant).
ActivityLogSchema.index({ createdAt: -1 });
ActivityLogSchema.index({ userId: 1, createdAt: -1 });

const ActivityLog = mongoose.model("ActivityLog", ActivityLogSchema);

module.exports = ActivityLog;
