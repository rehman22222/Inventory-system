const mongoose = require("mongoose");

// A "meal-deal"-style bundle: buy this set of products together and take a
// fixed amount off. The till detects it automatically as the items land in the
// basket and shows a DEAL badge.
const DealItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    // How many of this product a single set of the deal needs.
    quantity: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const DealSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },

    // How the set is recognised in the basket.
    //
    //   bundle — the original: a named recipe. "1 vape + 2 coils", every line
    //            present at its own quantity.
    //   mix    — pick-any-N. One pod comes in fifteen flavours and the offer is
    //            "any 3", not "3 of the Mango"; the shopper mixes them freely
    //            and `groupQuantity` is the only number that matters.
    mode: { type: String, enum: ["bundle", "mix"], default: "bundle" },

    // mix only: how many units, across all the chosen products, make one set.
    groupQuantity: { type: Number, default: 0, min: 0 },

    // How many times one deal can land in a single basket.
    //
    //   repeat_sets — every complete set counts. "3 for 18" charges 36 for six
    //                 and 18 + one at shelf price for four. This is what a
    //                 multibuy offer means to a shopper, and to the shop.
    //   single_set  — the offer lands once however far past the threshold they
    //                 go; everything after the first set is at shelf price.
    //
    // Deliberately without a schema default: the deals already in the database
    // have no such field, and absence has to keep meaning what that mode did
    // before this existed — see resolveQuantityRule in libs/deals.js. New deals
    // are given a value explicitly by the deal builder.
    quantityRule: { type: String, enum: ["repeat_sets", "single_set"] },

    // Optional window. Outside it the deal is not offered at the till, without
    // anyone having to remember to switch it off.
    startsAt: { type: Date },
    endsAt: { type: Date },

    // How much comes off per complete set present: a fixed amount in the shop's
    // currency, a percentage of the deal's own products, or `setPrice` — the
    // whole set for one figure ("any 3 for €10"), where `discount` holds that
    // figure rather than a reduction.
    discount: { type: Number, required: true, min: 0 },
    discountType: {
      type: String,
      enum: ["amount", "percent", "setPrice"],
      default: "amount",
    },
    items: {
      type: [DealItemSchema],
      validate: {
        validator: function (items) {
          if (!Array.isArray(items) || items.length === 0) return false;
          // A pick-any-N offer needs somewhere to pick from and an N worth
          // picking: "any 1 of these" is just a price change, not a deal.
          if (this.mode === "mix") return Number(this.groupQuantity) >= 2;
          return (
            items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0) >= 2
          );
        },
        message: "A deal needs at least two product units",
      },
    },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

DealSchema.index({ "items.product": 1 });

const Deal = mongoose.model("Deal", DealSchema);

module.exports = Deal;
