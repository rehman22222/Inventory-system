const mongoose = require("mongoose");

const VoucherSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ["amount", "percent"], required: true },
    value: { type: Number, required: true },

    minSpend: { type: Number, default: 0 },
    expiresAt: { type: Date },

    usageLimit: { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["active", "used", "expired", "disabled"],
      default: "active",
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    redeemedAt: { type: Date },
    redeemedOn: { type: String },
  },
  { timestamps: true }
);

// Discount this voucher is worth against a given subtotal, capped at the subtotal.
VoucherSchema.methods.computeDiscount = function (subtotal) {
  const amount =
    this.type === "percent" ? (Number(subtotal) * Number(this.value)) / 100 : Number(this.value);
  return Math.max(0, Math.min(amount, Number(subtotal)));
};

// Why a voucher can't be used right now, or null when it is usable.
VoucherSchema.methods.rejectionReason = function (subtotal) {
  if (this.status === "disabled") return "This voucher has been disabled";
  if (this.status === "used" || this.usedCount >= this.usageLimit)
    return "This voucher has already been used";
  if (this.expiresAt && this.expiresAt.getTime() < Date.now()) return "This voucher has expired";
  if (Number(subtotal) < Number(this.minSpend))
    return `This voucher needs a minimum spend of ${this.minSpend}`;
  return null;
};

const Voucher = mongoose.model("Voucher", VoucherSchema);

module.exports = Voucher;
