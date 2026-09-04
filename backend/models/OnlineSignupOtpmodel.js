const mongoose = require("mongoose");

const OnlineSignupOtpSchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 200,
    },
    phone: { type: String, trim: true, default: "", maxlength: 40 },
    passwordHash: { type: String, required: true, select: false },
    marketingOptIn: { type: Boolean, default: false },
    otpHash: { type: String, required: true, select: false },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

OnlineSignupOtpSchema.index({ store: 1, email: 1 }, { unique: true });

module.exports = mongoose.model("OnlineSignupOtp", OnlineSignupOtpSchema);
