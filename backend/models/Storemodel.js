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
    // Shown under the total — a thank-you note, a loyalty URL, opening hours.
    footer: { type: String, trim: true, default: "Thank you for shopping with us" },
    // What the receipt QR encodes. {ref} is swapped for the receipt number.
    qrTemplate: { type: String, trim: true, default: "{ref}" },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

const Store = mongoose.model("Store", StoreSchema);

module.exports = Store;
