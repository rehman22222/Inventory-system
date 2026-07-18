const mongoose = require("mongoose");

// The shop's own details — what the till shows and what prints on the receipt.
//
// This used to be a hard-coded file in the frontend, which meant renaming the
// shop needed a developer and a redeploy. It lives here so the owner can change
// it and every till picks it up.
//
// There is exactly one of these. `key` is pinned to "shop" with a unique index,
// so a second row cannot be created by accident.
const StoreSchema = new mongoose.Schema(
  {
    key: { type: String, default: "shop", unique: true, immutable: true },

    name: { type: String, required: true, trim: true, default: "My Shop" },
    // Free-form: one line per row on the receipt header.
    addressLines: [{ type: String, trim: true }],
    phone: { type: String, trim: true },
    // What the shop trades in. Reports print it beside every money column — a
    // column of bare numbers is not something you hand an accountant.
    currency: {
      type: String,
      enum: ["EUR", "GBP", "USD", "AED", "PKR", "INR", "BDT"],
      default: "EUR",
    },
    // The shop's own timezone (an IANA name, e.g. "Europe/Dublin"). Times are
    // always stored in UTC; this is only used to render reports and to work out
    // where a trading day starts and ends — so the same database serves shops in
    // different countries correctly. Not enum-checked here: the set of valid
    // zones is the platform's, validated in the controller.
    timezone: {
      type: String,
      default: "UTC",
      trim: true,
    },
    // Shown under the total — a thank-you note, a loyalty URL, opening hours.
    footer: { type: String, trim: true, default: "Thank you for shopping with us" },
    // What the receipt QR encodes. {ref} is swapped for the receipt number.
    qrTemplate: { type: String, trim: true, default: "{ref}" },

    // Where automatic reminders go (e.g. "low stock — approve a reorder"). If
    // blank, the system falls back to the owner's (superadmin's) login email.
    notificationsEmail: { type: String, trim: true, default: "" },

    // When the last daily low-stock digest (one email listing every low product)
    // was sent — used to keep it to once per 24h.
    lastLowStockDigestAt: { type: Date, default: null },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const Store = mongoose.model("Store", StoreSchema);

module.exports = Store;
