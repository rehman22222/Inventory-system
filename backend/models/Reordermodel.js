const mongoose = require("mongoose");

// A reorder is raised automatically when a product falls to (or below) its
// low‑stock threshold. It sits as `pending` until someone with authority
// approves it; approving emails the product's supplier the order. This keeps a
// clear paper trail: what ran low, who approved buying more, and when the
// supplier was told.
const ReorderSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },

    // Snapshot of the supplier at the time the reorder was raised. Kept inline
    // so the record still reads correctly even if the supplier is later edited
    // or removed.
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", default: null },
    supplierName: { type: String, default: "" },
    supplierEmail: { type: String, default: "" },

    // The counts that triggered it, plus how many to order (editable before
    // approval).
    currentQuantity: { type: Number, default: 0 },
    threshold: { type: Number, default: 0 },
    quantity: { type: Number, required: true, min: 1 },

    status: {
      type: String,
      enum: ["pending", "sent", "rejected", "cancelled"],
      default: "pending",
    },

    // Best‑effort reminder to the shop's notifications email that a reorder is
    // waiting for approval.
    reminderSentAt: { type: Date, default: null },
    // When the supplier order email actually went out.
    emailSentAt: { type: Date, default: null },
    emailError: { type: String, default: "" },

    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedByName: { type: String, default: "" },
    note: { type: String, default: "" },
  },
  { timestamps: true }
);

ReorderSchema.index({ status: 1, createdAt: -1 });
// At most one open (pending) reorder per product, so a run of sales doesn't
// pile up duplicate reorders for the same item.
ReorderSchema.index(
  { product: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

const Reorder = mongoose.model("Reorder", ReorderSchema);

module.exports = Reorder;
