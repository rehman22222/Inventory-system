const mongoose = require("mongoose");

// A shopper's account on the website.
//
// Deliberately NOT a `User`. A User is somebody who works here — they have a
// role, a till, an audit trail and a session that dies at the shop's midnight.
// A customer is none of those things: they sign in from their own phone, they
// see only their own orders, and their session should survive a night's sleep.
// Keeping the two collections apart means a customer record can never be
// mistaken for a staff account by any of the role guards, which is exactly the
// kind of mistake that is quiet, catastrophic and hard to find later.
//
// Guest checkout still works. An order carries an `account` only when the
// shopper was signed in, so nothing here is required in order to buy.

const AddressSchema = new mongoose.Schema(
  {
    // What the customer calls it — "Home", "Work". Free text, theirs.
    label: { type: String, trim: true, default: "", maxlength: 60 },
    line1: { type: String, trim: true, default: "", maxlength: 200 },
    line2: { type: String, trim: true, default: "", maxlength: 200 },
    city: { type: String, trim: true, default: "", maxlength: 100 },
    region: { type: String, trim: true, default: "", maxlength: 100 },
    postcode: { type: String, trim: true, default: "", maxlength: 30 },
    country: { type: String, trim: true, default: "", maxlength: 100 },
    // The one checkout fills in by default. Enforced to at most one per
    // customer by the controller, not by the schema — a broken flag should
    // degrade to "pick the first", never to a rejected save.
    isDefault: { type: Boolean, default: false },
  },
  { _id: true, timestamps: false },
);

const OnlineCustomerSchema = new mongoose.Schema(
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

    // Never returned by an ordinary query — a customer document is read all
    // over the admin, and a hash that ships with it is a hash waiting to be
    // logged, cached or serialised into a response by accident.
    passwordHash: { type: String, required: true, select: false },

    addresses: { type: [AddressSchema], default: [] },

    marketingOptIn: { type: Boolean, default: false },

    /* ── Loyalty ──────────────────────────────────────────────────────────
     * These three numbers are a CACHE. The ledger (OnlineLoyaltyEntry) is the
     * truth: every movement is a row, and the balance is the sum of the
     * confirmed ones. They are stored here because a shopper's account page
     * and the admin's customer list both need the balance on every read, and
     * summing a lifetime of ledger rows to render a number in a header is the
     * kind of query that is fine on day one and painful on day four hundred.
     *
     *   balance  — spendable now (confirmed earnings, less what was redeemed)
     *   pending  — earned on orders that have not been delivered yet
     *   lifetime — every point ever confirmed, never reduced. This is what
     *              decides a tier, so spending points cannot demote anybody.
     * ------------------------------------------------------------------- */
    points: {
      balance: { type: Number, default: 0, min: 0 },
      pending: { type: Number, default: 0, min: 0 },
      lifetime: { type: Number, default: 0, min: 0 },
    },

    // Denormalised order stats, kept up to date as orders are delivered. Same
    // reasoning as the points cache: the admin's customer list shows these for
    // every row at once.
    stats: {
      orders: { type: Number, default: 0, min: 0 },
      spend: { type: Number, default: 0, min: 0 },
      lastOrderAt: { type: Date, default: null },
    },

    // Blocked accounts can still be looked at by the shop, but cannot sign in
    // or place an order. Kept rather than deleted so their order history —
    // which is the shop's accounting record, not the customer's — survives.
    status: {
      type: String,
      enum: ["active", "blocked"],
      default: "active",
    },

    /* ── Sign-in protection ───────────────────────────────────────────────
     * The rate limiter in server.js caps how fast one IP can try. This caps
     * how many times one ACCOUNT can be tried, which is the attack the IP cap
     * does not stop: a slow, distributed guess against a known email.
     * ------------------------------------------------------------------- */
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },

    // Password reset. The token is stored HASHED — the email carries the only
    // copy of the real one, so a leaked database cannot be used to reset
    // anybody's password.
    resetTokenHash: { type: String, default: null, select: false },
    resetTokenExpiresAt: { type: Date, default: null, select: false },

    // Set when a member of staff blocks/edits the account, for the audit trail.
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// One account per email per shop. Sign-in looks up on exactly this pair.
OnlineCustomerSchema.index({ store: 1, email: 1 }, { unique: true });
// The admin's customer list: newest first, and "who is worth the most".
OnlineCustomerSchema.index({ store: 1, createdAt: -1 });
OnlineCustomerSchema.index({ store: 1, "stats.spend": -1 });
OnlineCustomerSchema.index({ store: 1, "points.balance": -1 });
// Search by name in the admin list without scanning the collection.
OnlineCustomerSchema.index({ name: "text", email: "text" });

// Never let a hash or a reset token out through res.json, whatever the caller
// selected. Belt and braces on top of `select: false`.
OnlineCustomerSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.resetTokenHash;
    delete ret.resetTokenExpiresAt;
    return ret;
  },
});

module.exports = mongoose.model("OnlineCustomer", OnlineCustomerSchema);
