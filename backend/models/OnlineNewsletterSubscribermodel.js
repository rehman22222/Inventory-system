const mongoose = require("mongoose");

const OnlineNewsletterSubscriberSchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 200,
    },
    source: {
      type: String,
      default: "footer",
      trim: true,
      maxlength: 60,
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

OnlineNewsletterSubscriberSchema.index({ store: 1, email: 1 }, { unique: true });

module.exports = mongoose.model(
  "OnlineNewsletterSubscriber",
  OnlineNewsletterSubscriberSchema,
);
