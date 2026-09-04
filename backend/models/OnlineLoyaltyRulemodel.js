const mongoose = require("mongoose");

// An earning rule the shop writes for itself.
//
// The base rate ("1 point per €1") lives in the store settings and applies to
// everything. This collection is how the shop says "…except". Except
// e-liquids, which earn double. Except this one kit, which earns a flat 200.
// Except best sellers this month. Except orders over €75, which get a bonus on
// top.
//
// Kept in its own collection rather than as an array on the settings document
// for two reasons: the list is unbounded and edited one row at a time, and a
// nested array of this shape is exactly the Mongoose subdocument that quietly
// fails to persist without markModified.
//
// HOW A BASKET IS PRICED IN POINTS (see libs/loyalty.js):
//   1. Every LINE finds the highest-priority active rule that matches it.
//      One rule per line — they do not stack, because a shopper who is told
//      "double points on e-liquid" and "triple on best sellers" and gets six
//      times has been given something nobody agreed to.
//   2. A line with no matching rule earns at the base rate.
//   3. ORDER rules are then added on top as a bonus. These DO stack with the
//      line earnings, because that is what a "spend €50, get 100 points"
//      promotion means.

const OnlineLoyaltyRuleSchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      index: true,
    },

    // Shown to the shop in the admin, and to the customer on their statement
    // ("Double points — E-liquids"). Write it the way you'd say it out loud.
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 300 },

    active: { type: Boolean, default: true },

    /* What this rule applies to.
     *   all          — every line. A way to raise the base rate for a period.
     *   category     — lines whose listing sits in any of `categories`.
     *   product      — lines for any of `listings`.
     *   best_sellers — lines whose listing carries the "bestseller" tag, which
     *                  is the same flag that puts it in the storefront's best
     *                  sellers row. The shop curates one list, not two.
     *   brand        — lines whose listing brand matches `brand`.
     *   order        — not a line rule at all: a bonus on the order as a whole.
     */
    scope: {
      type: String,
      enum: ["all", "category", "product", "best_sellers", "brand", "order"],
      required: true,
    },
    categories: [
      { type: mongoose.Schema.Types.ObjectId, ref: "OnlineCategory" },
    ],
    listings: [{ type: mongoose.Schema.Types.ObjectId, ref: "OnlineListing" }],
    brand: { type: String, default: "", trim: true, maxlength: 120 },

    /* How much it earns.
     *   per_currency — `value` points for each unit of currency spent on the
     *                  line. This is the same shape as the base rate, so a
     *                  rule can simply replace it for these products.
     *   per_unit     — `value` points for each ITEM taken, whatever it cost.
     *                  For a shop that wants a cheap consumable to earn its
     *                  own weight rather than its price.
     *   multiplier   — the base rate times `value`. "Double points" is 2.
     *                  Follows the base rate if the shop later changes it,
     *                  which is usually what "double" was meant to mean.
     *   fixed        — a flat `value` points, once. On a line rule that is per
     *                  line; on an order rule it is the whole bonus.
     */
    earnMode: {
      type: String,
      enum: ["per_currency", "per_unit", "multiplier", "fixed"],
      default: "per_currency",
    },
    value: { type: Number, required: true, min: 0 },

    // An order rule only fires at or above this. A line rule uses it as the
    // line's own minimum, so "spend €20 on e-liquid" is expressible too.
    minSpend: { type: Number, default: 0, min: 0 },

    // Ceiling on what one rule can hand out in a single order. 0 means no cap.
    // Worth setting on a multiplier — it is the difference between a generous
    // promotion and a mistake that costs the shop a weekend's margin.
    maxPointsPerOrder: { type: Number, default: 0, min: 0 },

    // Higher wins when two rules both match a line. Equal priorities fall back
    // to whichever was created first, so the order is at least stable.
    priority: { type: Number, default: 0 },

    // An optional run of dates, so a seasonal promotion stops on its own —
    // the same shape the till's deals use.
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// The evaluation read: every live rule for the shop, in the order they win.
OnlineLoyaltyRuleSchema.index({ store: 1, active: 1, priority: -1 });

module.exports = mongoose.model("OnlineLoyaltyRule", OnlineLoyaltyRuleSchema);
