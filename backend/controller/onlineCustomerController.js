/* Website customer accounts.
 *
 * Two audiences share this file, and the split matters:
 *
 *   STOREFRONT  — a shopper, reached through the website's own server. Every
 *                 one of these reads or writes exactly one account: their own,
 *                 taken from `req.customer` (see middleware/Authmiddleware).
 *                 No route here accepts a customer id from the caller, because
 *                 an id that arrives in a request is an id that can be changed
 *                 in a request.
 *
 *   ADMIN       — the shop, behind the same admin/superadmin guard as the rest
 *                 of the online store. Sees everybody, can adjust a balance and
 *                 can block an account, and every one of those is logged.
 */

const crypto = require("crypto");
const mongoose = require("mongoose");
const OnlineCustomer = require("../models/OnlineCustomermodel");
const OnlineSignupOtp = require("../models/OnlineSignupOtpmodel");
const OnlineOrder = require("../models/OnlineOrdermodel");
const OnlineLoyaltyEntry = require("../models/OnlineLoyaltyEntrymodel");
const OnlineLoyaltyRule = require("../models/OnlineLoyaltyRulemodel");
const { hashPassword, verifyPassword } = require("../libs/password");
const { signCustomerToken } = require("../libs/customerToken");
const { sendMail, brandedHtml, esc } = require("../libs/mailer");
const logActivity = require("../libs/logger");
const loyalty = require("../libs/loyalty");
const {
  storeId,
  getOrCreateSettings,
  DEFAULT_BRAND_NAME,
} = require("./onlineStoreController");
const { refreshOrderStats } = require("../libs/customerStats");

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

const requestError = (statusCode, message, extra = {}) =>
  Object.assign(new Error(message), { statusCode, ...extra });

const fail = (res, error, fallback) =>
  res.status(error.statusCode || 500).json({
    message: error.statusCode ? error.message : fallback,
  });

/* ── Validation ─────────────────────────────────────────────────────────────
 * Deliberately plain. The storefront validates with zod before anything gets
 * this far, but the storefront is not the security boundary — anything holding
 * the storefront key could call these directly.
 * ------------------------------------------------------------------------- */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const cleanEmail = (value) => String(value || "").trim().toLowerCase();

// Eight characters, and that is the whole rule.
//
// Complexity requirements — a capital, a digit, a symbol — are well documented
// as pushing people towards "Password1!" and a sticky note. Length is what
// actually helps, and a shop that turns away a customer over a missing
// punctuation mark has lost a sale to protect an order history.
const PASSWORD_MIN = 8;
const SIGNUP_OTP_MINUTES = 10;
const SIGNUP_OTP_MAX_ATTEMPTS = 5;

const checkPassword = (value) => {
  const password = String(value || "");
  if (password.length < PASSWORD_MIN) {
    throw requestError(
      400,
      `Please choose a password of at least ${PASSWORD_MIN} characters`,
    );
  }
  if (password.length > 200) {
    throw requestError(400, "That password is too long");
  }
  return password;
};

const text = (value, max) => String(value ?? "").trim().slice(0, max);

const cleanAddress = (raw = {}) => ({
  label: text(raw.label, 60),
  line1: text(raw.line1, 200),
  line2: text(raw.line2, 200),
  city: text(raw.city, 100),
  region: text(raw.region, 100),
  postcode: text(raw.postcode, 30),
  country: text(raw.country, 100),
  isDefault: Boolean(raw.isDefault),
});

const otpHash = (email, otp) =>
  crypto
    .createHash("sha256")
    .update(`${cleanEmail(email)}:${String(otp)}`)
    .digest("hex");

const newOtp = () => String(crypto.randomInt(100000, 1000000));

/* ── Shapes sent to the storefront ──────────────────────────────────────────
 * One function per shape, so the website and the account page can never drift
 * apart, and so nothing that is not listed here can leak out of this file.
 * ------------------------------------------------------------------------- */

const publicCustomer = (customer, settings) => {
  const tier = loyalty.tierFor(settings, customer.points?.lifetime || 0);
  const config = loyalty.programme(settings);
  return {
    id: String(customer._id),
    name: customer.name,
    email: customer.email,
    phone: customer.phone || "",
    marketingOptIn: Boolean(customer.marketingOptIn),
    createdAt: customer.createdAt,
    addresses: (customer.addresses || []).map((address) => ({
      id: String(address._id),
      label: address.label || "",
      line1: address.line1 || "",
      line2: address.line2 || "",
      city: address.city || "",
      region: address.region || "",
      postcode: address.postcode || "",
      country: address.country || "",
      isDefault: Boolean(address.isDefault),
    })),
    loyalty: {
      enabled: config.enabled,
      programName: config.programName,
      pointsName: config.pointsName,
      balance: Math.max(0, Number(customer.points?.balance || 0)),
      pending: Math.max(0, Number(customer.points?.pending || 0)),
      lifetime: Math.max(0, Number(customer.points?.lifetime || 0)),
      // What the spendable balance is actually worth, so the account page never
      // has to know the rate.
      value: money(
        Math.floor(
          (Math.max(0, Number(customer.points?.balance || 0)) /
            config.redeemRate) *
            100,
        ) / 100,
      ),
      redeemRate: config.redeemRate,
      earnRate: config.earnRate,
      minRedeemPoints: config.minRedeemPoints,
      maxRedeemPercent: config.maxRedeemPercent,
      tier: tier.current,
      nextTier: tier.next,
      tierProgress: tier.progress,
      tiers: tier.tiers,
    },
    stats: {
      orders: Number(customer.stats?.orders || 0),
      spend: money(customer.stats?.spend || 0),
      lastOrderAt: customer.stats?.lastOrderAt || null,
    },
  };
};

// The customer-facing name for each stage, and the order they happen in.
//
// The stored value and the word the shopper reads are deliberately not the same
// thing: "shipped" is what the database has always called it, "Dispatched" is
// what the shop says to a customer. Renaming the stored value to match would
// have stranded every order already written.
const TRACK_STEPS = [
  { status: "processing", label: "Order placed" },
  { status: "ready", label: "Ready to dispatch" },
  { status: "shipped", label: "Dispatched" },
  { status: "delivered", label: "Delivered" },
];

const STATUS_LABELS = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  processing: "Being prepared",
  ready: "Ready to dispatch",
  shipped: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/**
 * The tracker, as the shopper's page draws it.
 *
 * Built from the order's own timeline rather than from its current status, so a
 * shop that fulfils in one hop — straight from "being prepared" to "dispatched"
 * — shows a step that was genuinely skipped as skipped, instead of quietly
 * claiming it happened.
 */
const trackerFor = (order) => {
  const stamps = new Map();
  for (const entry of order.timeline || []) {
    if (!stamps.has(entry.status)) stamps.set(entry.status, entry.at);
  }

  const terminal = ["cancelled", "refunded"].includes(order.status);
  const reachedIndex = TRACK_STEPS.findIndex(
    (step) => step.status === order.status,
  );

  return {
    // A cancelled order has no progress to show — a half-filled bar under the
    // word "Cancelled" reads like the parcel is still coming.
    cancelled: terminal,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status] || order.status,
    steps: TRACK_STEPS.map((step, index) => ({
      status: step.status,
      label: step.label,
      at: stamps.get(step.status) || null,
      // Reached: either it has a stamp of its own, or the order has already
      // moved past it.
      done:
        !terminal &&
        (stamps.has(step.status) || (reachedIndex >= 0 && index < reachedIndex)),
      current: !terminal && step.status === order.status,
    })),
  };
};

const publicOrder = (order, { full = false } = {}) => {
  const base = {
    orderNo: order.orderNo,
    placedAt: order.createdAt,
    status: order.status,
    statusLabel: STATUS_LABELS[order.status] || order.status,
    total: money(order.total),
    itemCount: (order.items || []).reduce(
      (sum, item) => sum + Number(item.quantity || 0),
      0,
    ),
    paymentStatus: order.payment?.status || "unpaid",
    loyalty: {
      earned: Number(order.loyalty?.earned || 0),
      redeemed: Number(order.loyalty?.redeemed || 0),
      redeemedValue: money(order.loyalty?.redeemedValue || 0),
      confirmed: Boolean(order.loyalty?.confirmedAt),
    },
    items: (order.items || []).map((item) => ({
      name: item.name,
      brand: item.brand || "",
      quantity: item.quantity,
      price: money(item.price),
      lineTotal: money(item.lineTotal),
    })),
  };

  if (!full) return base;

  return {
    ...base,
    subtotal: money(order.subtotal),
    shipping: money(order.shipping),
    discount: money(order.discount),
    tax: money(order.tax),
    voucher: order.voucher?.code
      ? { code: order.voucher.code, name: order.voucher.name }
      : null,
    note: order.note || "",
    shippingAddress: order.shippingAddress || {},
    customer: {
      name: order.customer?.name || "",
      email: order.customer?.email || "",
      phone: order.customer?.phone || "",
    },
    payment: {
      method: order.payment?.method || "",
      status: order.payment?.status || "unpaid",
    },
    tracking: {
      carrier: order.tracking?.carrier || "",
      number: order.tracking?.number || "",
      url: order.tracking?.url || "",
      estimate: order.tracking?.estimate || "",
    },
    tracker: trackerFor(order),
    // The shop's notes to the customer, in the order they were written. Staff
    // names are not included: a shopper is owed the news, not the roster.
    updates: (order.timeline || [])
      .filter((entry) => entry.note)
      .map((entry) => ({
        at: entry.at,
        status: entry.status,
        label: STATUS_LABELS[entry.status] || entry.status,
        note: entry.note,
      })),
  };
};

/* ── Linking guest orders ───────────────────────────────────────────────────
 * Somebody who bought as a guest last month and signs up today should find
 * that order waiting in their history. Matching on the email the order was
 * placed with is the only link there is, and it is the same email they have
 * just proved they can receive mail at.
 *
 * Points are NOT awarded retroactively. A shop that suddenly owes a rewards
 * balance to everybody who ever bought from it has been handed a liability it
 * never agreed to, and the customer was not promised anything at the time.
 * ------------------------------------------------------------------------- */
const claimGuestOrders = async (customer) => {
  try {
    const result = await OnlineOrder.updateMany(
      {
        store: customer.store,
        "customer.email": customer.email,
        "customer.account": null,
      },
      { $set: { "customer.account": customer._id } },
    );
    if (result.modifiedCount) {
      await refreshOrderStats(customer._id);
    }
    return result.modifiedCount || 0;
  } catch (error) {
    // Never fail a sign-in over this. The history is a convenience; the session
    // is the thing they asked for.
    console.error("[account] claiming guest orders failed:", error.message);
    return 0;
  }
};

/* ── Sign-in protection ─────────────────────────────────────────────────── */

const MAX_FAILED_LOGINS = 8;
const LOCKOUT_MINUTES = 15;

const lockedOut = (customer) =>
  customer.lockedUntil && customer.lockedUntil.getTime() > Date.now();

/* ── Storefront: register / sign in ─────────────────────────────────────── */

module.exports.register = async (req, res) => {
  try {
    const store = await storeId();
    const settings = await getOrCreateSettings(store);
    if (settings.accounts?.enabled === false) {
      throw requestError(403, "Accounts are not available on this store");
    }

    const name = text(req.body?.name, 120);
    const email = cleanEmail(req.body?.email);
    const phone = text(req.body?.phone, 40);
    const password = checkPassword(req.body?.password);

    if (name.length < 2) throw requestError(400, "Please tell us your name");
    if (!EMAIL.test(email)) throw requestError(400, "That email doesn't look right");

    const existing = await OnlineCustomer.findOne({ store, email }).lean();
    if (existing) {
      throw requestError(
        409,
        "There is already an account with this email — try signing in instead",
      );
    }

    const otp = newOtp();
    await OnlineSignupOtp.findOneAndUpdate(
      { store, email },
      {
        store,
        name,
        email,
        phone,
        passwordHash: await hashPassword(password),
        marketingOptIn: Boolean(req.body?.marketingOptIn),
        otpHash: otpHash(email, otp),
        attempts: 0,
        expiresAt: new Date(Date.now() + SIGNUP_OTP_MINUTES * 60_000),
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    const mail = await sendSignupOtpEmail(settings, { name, email }, otp);
    if (!mail.ok && process.env.NODE_ENV === "production") {
      throw requestError(
        503,
        "We could not send the verification code. Please try again in a moment.",
      );
    }

    return res.status(201).json({
      message: "Verification code sent",
      email,
      expiresInMinutes: SIGNUP_OTP_MINUTES,
      ...(process.env.NODE_ENV !== "production" && !mail.ok ? { devOtp: otp } : {}),
    });
  } catch (error) {
    return fail(res, error, "Could not start the account");
  }
};

module.exports.verifyRegistration = async (req, res) => {
  try {
    const store = await storeId();
    const settings = await getOrCreateSettings(store);
    if (settings.accounts?.enabled === false) {
      throw requestError(403, "Accounts are not available on this store");
    }

    const email = cleanEmail(req.body?.email);
    const otp = String(req.body?.otp || "").replace(/\D/g, "");
    if (!EMAIL.test(email)) throw requestError(400, "That email doesn't look right");
    if (otp.length !== 6) throw requestError(400, "Enter the 6 digit code");

    const existing = await OnlineCustomer.findOne({ store, email }).lean();
    if (existing) {
      throw requestError(
        409,
        "There is already an account with this email â€” try signing in instead",
      );
    }

    const pending = await OnlineSignupOtp.findOne({ store, email }).select(
      "+passwordHash +otpHash",
    );
    if (!pending || pending.expiresAt.getTime() <= Date.now()) {
      if (pending) await OnlineSignupOtp.deleteOne({ _id: pending._id });
      throw requestError(400, "That code has expired. Please request a new one.");
    }

    if (pending.attempts >= SIGNUP_OTP_MAX_ATTEMPTS) {
      await OnlineSignupOtp.deleteOne({ _id: pending._id });
      throw requestError(429, "Too many attempts. Please request a new code.");
    }

    if (pending.otpHash !== otpHash(email, otp)) {
      pending.attempts += 1;
      await pending.save();
      throw requestError(400, "That code is not correct");
    }

    const customer = await OnlineCustomer.create({
      store,
      name: pending.name,
      email: pending.email,
      phone: pending.phone,
      passwordHash: pending.passwordHash,
      marketingOptIn: Boolean(pending.marketingOptIn),
      lastLoginAt: new Date(),
    });
    await OnlineSignupOtp.deleteOne({ _id: pending._id });

    // A welcome bonus, if the shop offers one. Written through the ledger like
    // everything else, so it shows on the customer's statement as a real line
    // rather than a balance that started at a number nobody can explain.
    const config = loyalty.programme(settings);
    if (config.enabled && config.signupBonus > 0) {
      await loyalty.postEntry({
        store,
        customer,
        kind: "bonus",
        points: config.signupBonus,
        reason: `Welcome to ${config.programName}`,
        settings,
      });
    }

    const claimed = await claimGuestOrders(customer);

    const fresh = await OnlineCustomer.findById(customer._id);
    sendWelcomeEmail(settings, fresh).catch(() => {});

    return res.status(201).json({
      message: "Account created",
      token: signCustomerToken(fresh),
      customer: publicCustomer(fresh, settings),
      claimedOrders: claimed,
    });
  } catch (error) {
    return fail(res, error, "Could not create the account");
  }
};

module.exports.login = async (req, res) => {
  try {
    const store = await storeId();
    const settings = await getOrCreateSettings(store);
    const email = cleanEmail(req.body?.email);
    const password = String(req.body?.password || "");

    // One message for every kind of failure, so a stranger cannot use the login
    // form to find out which email addresses have accounts here.
    const refuse = () =>
      res.status(401).json({ message: "Email or password is incorrect" });

    if (!email || !password) return refuse();

    const customer = await OnlineCustomer.findOne({ store, email }).select(
      "+passwordHash",
    );
    if (!customer) return refuse();

    if (customer.status !== "active") {
      return res.status(403).json({
        message:
          "This account has been suspended. Please contact us if you think that's a mistake.",
      });
    }

    if (lockedOut(customer)) {
      const minutes = Math.max(
        1,
        Math.ceil((customer.lockedUntil.getTime() - Date.now()) / 60000),
      );
      return res.status(429).json({
        message: `Too many attempts — please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      });
    }

    const { valid, needsUpgrade } = await verifyPassword(
      password,
      customer.passwordHash,
    );

    if (!valid) {
      // Count the attempt against THIS ACCOUNT. The IP rate limit in server.js
      // caps how fast one machine can guess; this caps how many times one
      // account can be guessed at, which is the slow distributed attack the IP
      // cap does not see.
      customer.failedLogins = Number(customer.failedLogins || 0) + 1;
      if (customer.failedLogins >= MAX_FAILED_LOGINS) {
        customer.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60_000);
        customer.failedLogins = 0;
      }
      await customer.save();
      return refuse();
    }

    // Rehash quietly if the shop has since raised its bcrypt cost.
    if (needsUpgrade) {
      customer.passwordHash = await hashPassword(password);
    }
    customer.failedLogins = 0;
    customer.lockedUntil = null;
    customer.lastLoginAt = new Date();
    await customer.save();

    await claimGuestOrders(customer);
    const fresh = await OnlineCustomer.findById(customer._id);

    return res.status(200).json({
      message: "Signed in",
      token: signCustomerToken(fresh),
      customer: publicCustomer(fresh, settings),
    });
  } catch (error) {
    return fail(res, error, "Could not sign you in");
  }
};

module.exports.me = async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.customer.store);
    return res
      .status(200)
      .json({ customer: publicCustomer(req.customer, settings) });
  } catch (error) {
    return fail(res, error, "Could not load your account");
  }
};

/* ── Storefront: profile ────────────────────────────────────────────────── */

module.exports.updateProfile = async (req, res) => {
  try {
    const customer = req.customer;
    const settings = await getOrCreateSettings(customer.store);

    if (req.body?.name !== undefined) {
      const name = text(req.body.name, 120);
      if (name.length < 2) throw requestError(400, "Please tell us your name");
      customer.name = name;
    }
    if (req.body?.phone !== undefined) {
      customer.phone = text(req.body.phone, 40);
    }
    if (req.body?.marketingOptIn !== undefined) {
      customer.marketingOptIn = Boolean(req.body.marketingOptIn);
    }

    // The email is not editable here on purpose. It is the account's identity,
    // it is where a password reset goes, and it is what links historic guest
    // orders — changing it needs a confirmation loop through the new address,
    // which is a feature in its own right rather than a field on a form.

    await customer.save();
    return res.status(200).json({
      message: "Your details are saved",
      customer: publicCustomer(customer, settings),
    });
  } catch (error) {
    return fail(res, error, "Could not save your details");
  }
};

module.exports.changePassword = async (req, res) => {
  try {
    const customer = await OnlineCustomer.findById(req.customer._id).select(
      "+passwordHash",
    );
    const current = String(req.body?.currentPassword || "");
    const next = checkPassword(req.body?.newPassword);

    const { valid } = await verifyPassword(current, customer.passwordHash);
    if (!valid) throw requestError(401, "Your current password is incorrect");

    customer.passwordHash = await hashPassword(next);
    await customer.save();

    return res.status(200).json({ message: "Password changed" });
  } catch (error) {
    return fail(res, error, "Could not change your password");
  }
};

/* ── Storefront: addresses ──────────────────────────────────────────────── */

// At most one default. Enforced here rather than in the schema so a list that
// somehow arrives with two never fails to save — it just gets tidied up.
const applyDefault = (customer, addressId) => {
  let found = false;
  for (const address of customer.addresses) {
    const isThisOne = String(address._id) === String(addressId);
    address.isDefault = isThisOne;
    if (isThisOne) found = true;
  }
  // Nothing marked: the first one stands in, so checkout always has something
  // to prefill.
  if (!found && customer.addresses.length) customer.addresses[0].isDefault = true;
};

module.exports.saveAddress = async (req, res) => {
  try {
    const customer = req.customer;
    const settings = await getOrCreateSettings(customer.store);
    const payload = cleanAddress(req.body);

    if (!payload.line1 || !payload.city || !payload.postcode) {
      throw requestError(400, "An address needs at least a street, a town and a postcode");
    }

    const id = req.params.addressId;
    if (id) {
      const existing = customer.addresses.id(id);
      if (!existing) throw requestError(404, "That address is not on your account");
      Object.assign(existing, payload);
    } else {
      if (customer.addresses.length >= 10) {
        throw requestError(400, "You can keep up to 10 saved addresses");
      }
      customer.addresses.push(payload);
    }

    const target = id || customer.addresses[customer.addresses.length - 1]._id;
    // First address saved is the default whether they asked for it or not —
    // there is nothing else it could be.
    if (payload.isDefault || customer.addresses.length === 1) {
      applyDefault(customer, target);
    }

    await customer.save();
    return res.status(200).json({
      message: id ? "Address updated" : "Address saved",
      customer: publicCustomer(customer, settings),
    });
  } catch (error) {
    return fail(res, error, "Could not save that address");
  }
};

module.exports.deleteAddress = async (req, res) => {
  try {
    const customer = req.customer;
    const settings = await getOrCreateSettings(customer.store);
    const existing = customer.addresses.id(req.params.addressId);
    if (!existing) throw requestError(404, "That address is not on your account");

    const wasDefault = existing.isDefault;
    existing.deleteOne();
    // Deleting the default must leave one behind, or checkout stops prefilling
    // for somebody who still has addresses saved.
    if (wasDefault && customer.addresses.length) {
      applyDefault(customer, customer.addresses[0]._id);
    }

    await customer.save();
    return res.status(200).json({
      message: "Address removed",
      customer: publicCustomer(customer, settings),
    });
  } catch (error) {
    return fail(res, error, "Could not remove that address");
  }
};

/* ── Storefront: orders ─────────────────────────────────────────────────── */

module.exports.myOrders = async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const filter = { "customer.account": req.customer._id };
    const [orders, total] = await Promise.all([
      OnlineOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      OnlineOrder.countDocuments(filter),
    ]);

    return res.status(200).json({
      orders: orders.map((order) => publicOrder(order)),
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    });
  } catch (error) {
    return fail(res, error, "Could not load your orders");
  }
};

module.exports.myOrder = async (req, res) => {
  try {
    // Scoped by account, not just by order number: an order number is a short
    // predictable string, and looking one up must never be enough to read
    // somebody else's delivery address.
    const order = await OnlineOrder.findOne({
      orderNo: String(req.params.orderNo || "").trim(),
      "customer.account": req.customer._id,
    }).lean();

    if (!order) throw requestError(404, "We couldn't find that order on your account");

    return res.status(200).json({ order: publicOrder(order, { full: true }) });
  } catch (error) {
    return fail(res, error, "Could not load that order");
  }
};

/* ── Storefront: rewards ────────────────────────────────────────────────── */

module.exports.myRewards = async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.customer.store);
    const config = loyalty.programme(settings);
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const page = Math.max(Number(req.query.page) || 1, 1);

    const [entries, total, rules] = await Promise.all([
      OnlineLoyaltyEntry.find({ customer: req.customer._id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      OnlineLoyaltyEntry.countDocuments({ customer: req.customer._id }),
      // What is on offer right now, so the rewards page can say how to earn
      // more instead of only showing what has already happened.
      OnlineLoyaltyRule.find({
        store: req.customer.store,
        active: true,
        $or: [{ endsAt: null }, { endsAt: { $gte: new Date() } }],
      })
        .sort({ priority: -1 })
        .limit(12)
        .lean(),
    ]);

    return res.status(200).json({
      summary: publicCustomer(req.customer, settings).loyalty,
      terms: config.terms,
      entries: entries.map((entry) => ({
        id: String(entry._id),
        at: entry.createdAt,
        kind: entry.kind,
        points: entry.points,
        status: entry.status,
        balanceAfter: entry.balanceAfter,
        orderNo: entry.orderNo || "",
        reason: entry.reason || "",
        value: money(entry.value),
        breakdown: (entry.breakdown || []).map((row) => ({
          name: row.name,
          rule: row.rule,
          points: row.points,
        })),
      })),
      offers: rules.map((rule) => ({
        name: rule.name,
        description: rule.description || "",
        scope: rule.scope,
        earnMode: rule.earnMode,
        value: rule.value,
        minSpend: rule.minSpend || 0,
        endsAt: rule.endsAt || null,
      })),
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
    });
  } catch (error) {
    return fail(res, error, "Could not load your rewards");
  }
};

/* ── Storefront: password reset ─────────────────────────────────────────── */

const RESET_TTL_MINUTES = 60;

module.exports.forgotPassword = async (req, res) => {
  // Always the same answer, whether or not the address has an account. The
  // alternative turns this form into a way to test which of a list of emails
  // shop here — which for an age-restricted retailer is not a small thing.
  const sameAnswer = () =>
    res.status(200).json({
      message:
        "If that email has an account with us, a reset link is on its way.",
    });

  try {
    const store = await storeId();
    const email = cleanEmail(req.body?.email);
    if (!EMAIL.test(email)) return sameAnswer();

    const customer = await OnlineCustomer.findOne({ store, email });
    if (!customer || customer.status !== "active") return sameAnswer();

    // The email carries the only copy of the real token; the database keeps
    // only its hash. A leaked backup therefore cannot be used to reset anybody.
    const token = crypto.randomBytes(32).toString("hex");
    customer.resetTokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");
    customer.resetTokenExpiresAt = new Date(
      Date.now() + RESET_TTL_MINUTES * 60_000,
    );
    await customer.save();

    const settings = await getOrCreateSettings(store);
    await sendResetEmail(settings, customer, token).catch((error) =>
      console.error("[account] reset email failed:", error.message),
    );

    return sameAnswer();
  } catch (error) {
    console.error("[account] forgot password failed:", error.message);
    return sameAnswer();
  }
};

module.exports.resetPassword = async (req, res) => {
  try {
    const store = await storeId();
    const token = String(req.body?.token || "").trim();
    const password = checkPassword(req.body?.password);
    if (!token) throw requestError(400, "That reset link is not valid");

    const resetTokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const customer = await OnlineCustomer.findOne({
      store,
      resetTokenHash,
      resetTokenExpiresAt: { $gt: new Date() },
    }).select("+passwordHash +resetTokenHash +resetTokenExpiresAt");

    if (!customer) {
      throw requestError(
        400,
        "That reset link has expired. Please request a new one.",
      );
    }

    customer.passwordHash = await hashPassword(password);
    customer.resetTokenHash = null;
    customer.resetTokenExpiresAt = null;
    // A reset is also the way out of a lockout — somebody who has proved they
    // can read the account's email has proved rather more than a password does.
    customer.failedLogins = 0;
    customer.lockedUntil = null;
    customer.lastLoginAt = new Date();
    await customer.save();

    const settings = await getOrCreateSettings(store);
    return res.status(200).json({
      message: "Your password has been changed",
      token: signCustomerToken(customer),
      customer: publicCustomer(customer, settings),
    });
  } catch (error) {
    return fail(res, error, "Could not reset your password");
  }
};

/* ── Emails ─────────────────────────────────────────────────────────────────
 * Both go from the SHOP's own mailbox, not the platform's, so a customer sees
 * the brand they bought from. Same rule the order confirmations follow.
 * ------------------------------------------------------------------------- */

const DEFAULT_STOREFRONT_PUBLIC_URL = "https://cliffsofpuff.com";

const storefrontBase = () => {
  const configured = String(
    process.env.STOREFRONT_PUBLIC_URL || DEFAULT_STOREFRONT_PUBLIC_URL,
  ).trim();
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return DEFAULT_STOREFRONT_PUBLIC_URL;
    }
    return url.href.replace(/\/+$/, "");
  } catch {
    return DEFAULT_STOREFRONT_PUBLIC_URL;
  }
};

const brandFrom = (settings) => ({
  name:
    settings?.business?.tradingName ||
    settings?.business?.legalName ||
    DEFAULT_BRAND_NAME,
  addressLines: settings?.footer?.address ? [settings.footer.address] : [],
  phone: settings?.footer?.supportPhone || "",
});

const sendWelcomeEmail = async (settings, customer) => {
  const brand = brandFrom(settings);
  const config = loyalty.programme(settings);
  const firstName = String(customer.name || "there").trim().split(/\s+/)[0];
  const bonus =
    config.enabled && config.signupBonus > 0
      ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">We've put <strong>${config.signupBonus} ${esc(config.pointsName)}</strong> into your ${esc(config.programName)} balance to get you started.</p>`
      : "";

  return sendMail({
    to: customer.email,
    subject: `Welcome to ${brand.name}`,
    account: "store",
    fromName: brand.name,
    html: brandedHtml(
      brand,
      `<h2 style="margin:0 0 12px;font-size:20px;">Hi ${esc(firstName)},</h2>
       <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Your account is ready. You can now track your orders, save your delivery details and check out faster next time.</p>
       ${bonus}
       <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">
         <a href="${storefrontBase()}/account" style="color:#181410;font-weight:600;">View your account</a>
       </p>`,
    ),
  });
};

const sendSignupOtpEmail = async (settings, customer, otp) => {
  const brand = brandFrom(settings);
  const firstName = String(customer.name || "there").trim().split(/\s+/)[0];

  return sendMail({
    to: customer.email,
    subject: `Your ${brand.name} verification code`,
    account: "store",
    fromName: brand.name,
    html: brandedHtml(
      brand,
      `<h2 style="margin:0 0 12px;font-size:20px;">Hi ${esc(firstName)},</h2>
       <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Use this code to finish creating your account.</p>
       <div style="font-size:32px;font-weight:800;letter-spacing:8px;margin:18px 0;padding:16px 18px;border:1px solid #e5e7eb;background:#f8fafc;text-align:center;">${esc(otp)}</div>
       <p style="margin:0;font-size:13px;line-height:1.6;color:#6f685b;">This code expires in ${SIGNUP_OTP_MINUTES} minutes. If you did not request it, you can ignore this email.</p>`,
    ),
  });
};

const sendResetEmail = async (settings, customer, token) => {
  const brand = brandFrom(settings);
  const firstName = String(customer.name || "there").trim().split(/\s+/)[0];
  const link = `${storefrontBase()}/account/reset?token=${encodeURIComponent(token)}`;

  return sendMail({
    to: customer.email,
    subject: `Reset your ${brand.name} password`,
    account: "store",
    fromName: brand.name,
    html: brandedHtml(
      brand,
      `<h2 style="margin:0 0 12px;font-size:20px;">Hi ${esc(firstName)},</h2>
       <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Someone asked to reset the password on your account. If that was you, use the link below — it works once and expires in ${RESET_TTL_MINUTES} minutes.</p>
       <p style="margin:0 0 20px;">
         <a href="${link}" style="display:inline-block;background:#181410;color:#bdf000;padding:12px 22px;font-weight:600;text-decoration:none;">Choose a new password</a>
       </p>
       <p style="margin:0;font-size:13px;line-height:1.6;color:#6f685b;">If it wasn't you, you can ignore this email — nothing has changed.</p>`,
    ),
  });
};

/* ═══════════════════════════════════════════════════════════════════════════
 * ADMIN — the shop's side
 * ═══════════════════════════════════════════════════════════════════════════ */

module.exports.listCustomers = async (req, res) => {
  try {
    const store = await storeId();
    const settings = await getOrCreateSettings(store);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const search = String(req.query.search || "").trim();

    const filter = { store };
    if (req.query.status && ["active", "blocked"].includes(req.query.status)) {
      filter.status = req.query.status;
    }
    if (search) {
      // Escaped: a customer searching for "a+b" must not be able to hand the
      // database a regular expression of their own.
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: safe, $options: "i" } },
        { email: { $regex: safe, $options: "i" } },
        { phone: { $regex: safe, $options: "i" } },
      ];
    }

    const sortField =
      {
        newest: { createdAt: -1 },
        spend: { "stats.spend": -1 },
        points: { "points.balance": -1 },
        orders: { "stats.orders": -1 },
      }[String(req.query.sort || "newest")] || { createdAt: -1 };

    const [customers, total, totals] = await Promise.all([
      OnlineCustomer.find(filter)
        .sort(sortField)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      OnlineCustomer.countDocuments(filter),
      OnlineCustomer.aggregate([
        { $match: { store } },
        {
          $group: {
            _id: null,
            customers: { $sum: 1 },
            spend: { $sum: "$stats.spend" },
            orders: { $sum: "$stats.orders" },
            pointsOut: { $sum: "$points.balance" },
          },
        },
      ]),
    ]);

    const config = loyalty.programme(settings);

    return res.status(200).json({
      customers: customers.map((customer) => ({
        _id: String(customer._id),
        name: customer.name,
        email: customer.email,
        phone: customer.phone || "",
        status: customer.status,
        marketingOptIn: Boolean(customer.marketingOptIn),
        createdAt: customer.createdAt,
        lastLoginAt: customer.lastLoginAt,
        points: {
          balance: Number(customer.points?.balance || 0),
          pending: Number(customer.points?.pending || 0),
          lifetime: Number(customer.points?.lifetime || 0),
        },
        tier: loyalty.tierFor(settings, customer.points?.lifetime || 0).current,
        stats: {
          orders: Number(customer.stats?.orders || 0),
          spend: money(customer.stats?.spend || 0),
          lastOrderAt: customer.stats?.lastOrderAt || null,
        },
      })),
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      total,
      // Headline figures for the tab, computed across every customer rather
      // than the page being shown.
      summary: {
        customers: Number(totals[0]?.customers || 0),
        orders: Number(totals[0]?.orders || 0),
        spend: money(totals[0]?.spend || 0),
        pointsOutstanding: Number(totals[0]?.pointsOut || 0),
        // What the shop owes, in money, if every point were spent tomorrow.
        // The number that makes a loyalty programme a real decision.
        liability: money(
          Number(totals[0]?.pointsOut || 0) / config.redeemRate,
        ),
        pointsName: config.pointsName,
        loyaltyEnabled: config.enabled,
      },
    });
  } catch (error) {
    return fail(res, error, "Could not load customers");
  }
};

module.exports.getCustomer = async (req, res) => {
  try {
    const store = await storeId();
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw requestError(400, "Invalid customer id");
    }
    const settings = await getOrCreateSettings(store);
    const customer = await OnlineCustomer.findOne({
      _id: req.params.id,
      store,
    }).lean();
    if (!customer) throw requestError(404, "Customer not found");

    const [orders, entries] = await Promise.all([
      OnlineOrder.find({ "customer.account": customer._id })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      OnlineLoyaltyEntry.find({ customer: customer._id })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
    ]);

    const tier = loyalty.tierFor(settings, customer.points?.lifetime || 0);

    return res.status(200).json({
      customer: {
        _id: String(customer._id),
        name: customer.name,
        email: customer.email,
        phone: customer.phone || "",
        status: customer.status,
        marketingOptIn: Boolean(customer.marketingOptIn),
        createdAt: customer.createdAt,
        lastLoginAt: customer.lastLoginAt,
        addresses: customer.addresses || [],
        points: {
          balance: Number(customer.points?.balance || 0),
          pending: Number(customer.points?.pending || 0),
          lifetime: Number(customer.points?.lifetime || 0),
        },
        tier: tier.current,
        nextTier: tier.next,
        stats: {
          orders: Number(customer.stats?.orders || 0),
          spend: money(customer.stats?.spend || 0),
          lastOrderAt: customer.stats?.lastOrderAt || null,
        },
      },
      orders: orders.map((order) => ({
        _id: String(order._id),
        orderNo: order.orderNo,
        createdAt: order.createdAt,
        status: order.status,
        total: money(order.total),
        items: (order.items || []).length,
        loyalty: {
          earned: Number(order.loyalty?.earned || 0),
          redeemed: Number(order.loyalty?.redeemed || 0),
        },
      })),
      ledger: entries.map((entry) => ({
        _id: String(entry._id),
        at: entry.createdAt,
        kind: entry.kind,
        points: entry.points,
        status: entry.status,
        balanceAfter: entry.balanceAfter,
        orderNo: entry.orderNo || "",
        reason: entry.reason || "",
        byName: entry.byName || "",
      })),
    });
  } catch (error) {
    return fail(res, error, "Could not load that customer");
  }
};

module.exports.setCustomerStatus = async (req, res) => {
  try {
    const store = await storeId();
    const status = String(req.body?.status || "");
    if (!["active", "blocked"].includes(status)) {
      throw requestError(400, "Status must be active or blocked");
    }
    const customer = await OnlineCustomer.findOneAndUpdate(
      { _id: req.params.id, store },
      { $set: { status, updatedBy: req.user?._id || null } },
      { new: true },
    );
    if (!customer) throw requestError(404, "Customer not found");

    await logActivity({
      action: status === "blocked" ? "Customer Blocked" : "Customer Unblocked",
      description: `Website account ${customer.email} marked ${status}.`,
      entity: "onlineCustomer",
      entityId: customer._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    return res
      .status(200)
      .json({ message: `Account ${status === "blocked" ? "blocked" : "reactivated"}` });
  } catch (error) {
    return fail(res, error, "Could not update that customer");
  }
};

/**
 * Move a balance by hand.
 *
 * A goodwill gesture, a correction, a competition prize. Always through the
 * ledger and always signed with the name of whoever did it — a balance that can
 * be changed without a trace is one nobody can defend in an argument with a
 * customer, and this is the one route in the whole feature that lets a person
 * create points out of nothing.
 */
module.exports.adjustPoints = async (req, res) => {
  try {
    const store = await storeId();
    const settings = await getOrCreateSettings(store);
    const points = Math.trunc(Number(req.body?.points));
    const reason = text(req.body?.reason, 300);

    if (!Number.isFinite(points) || points === 0) {
      throw requestError(400, "Enter how many points to add or take away");
    }
    if (Math.abs(points) > 1_000_000) {
      throw requestError(400, "That adjustment is too large");
    }
    if (!reason) {
      throw requestError(400, "Please say why — the customer can see this");
    }

    const customer = await OnlineCustomer.findOne({
      _id: req.params.id,
      store,
    });
    if (!customer) throw requestError(404, "Customer not found");

    // A balance cannot go below zero. Taking away more than somebody has is
    // almost always a typo, and the alternative — a negative balance the
    // customer has to earn their way out of before anything works again — is
    // not something to do by accident.
    const balance = Number(customer.points?.balance || 0);
    if (points < 0 && balance + points < 0) {
      throw requestError(
        400,
        `${customer.name} only has ${balance} ${loyalty.programme(settings).pointsName}`,
      );
    }

    await loyalty.postEntry({
      store,
      customer,
      kind: "adjust",
      points,
      reason,
      by: req.user?._id || null,
      byName: req.user?.name || "",
      settings,
    });

    await logActivity({
      action: "Loyalty Points Adjusted",
      description: `${points > 0 ? "+" : ""}${points} points for ${customer.email} — ${reason}`,
      entity: "onlineCustomer",
      entityId: customer._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    const updated = await OnlineCustomer.findById(customer._id).lean();
    return res.status(200).json({
      message: `${points > 0 ? "Added" : "Removed"} ${Math.abs(points)} points`,
      balance: Number(updated?.points?.balance || 0),
    });
  } catch (error) {
    return fail(res, error, "Could not adjust those points");
  }
};

// Put a drifted cache back in step with the ledger. Manual, and rarely needed —
// see libs/loyalty.recomputeBalance for why it exists at all.
module.exports.recalculatePoints = async (req, res) => {
  try {
    const store = await storeId();
    const customer = await OnlineCustomer.findOne({
      _id: req.params.id,
      store,
    }).lean();
    if (!customer) throw requestError(404, "Customer not found");

    const points = await loyalty.recomputeBalance(customer._id);
    await refreshOrderStats(customer._id);

    return res
      .status(200)
      .json({ message: "Balance recalculated from the statement", points });
  } catch (error) {
    return fail(res, error, "Could not recalculate that balance");
  }
};

/* ── Admin: loyalty rules ───────────────────────────────────────────────── */

const ruleFields = (body, current = {}) => {
  const scope = String(body.scope ?? current.scope ?? "");
  if (
    !["all", "category", "product", "best_sellers", "brand", "order"].includes(
      scope,
    )
  ) {
    throw requestError(400, "Pick what the rule applies to");
  }

  const earnMode = String(body.earnMode ?? current.earnMode ?? "per_currency");
  if (!["per_currency", "per_unit", "multiplier", "fixed"].includes(earnMode)) {
    throw requestError(400, "Pick how the rule earns");
  }

  const name = text(body.name ?? current.name, 120);
  if (!name) throw requestError(400, "Give the rule a name");

  const value = Number(body.value ?? current.value);
  if (!Number.isFinite(value) || value < 0) {
    throw requestError(400, "Enter how much the rule earns");
  }

  const ids = (list) =>
    (Array.isArray(list) ? list : [])
      .map(String)
      .filter((id) => mongoose.isValidObjectId(id))
      .slice(0, 200);

  const categories = ids(body.categories ?? current.categories);
  const listings = ids(body.listings ?? current.listings);
  const brand = text(body.brand ?? current.brand, 120);

  // A rule that targets nothing would silently earn nothing, and look for all
  // the world like a rule that was working.
  if (scope === "category" && !categories.length) {
    throw requestError(400, "Choose at least one category for this rule");
  }
  if (scope === "product" && !listings.length) {
    throw requestError(400, "Choose at least one product for this rule");
  }
  if (scope === "brand" && !brand) {
    throw requestError(400, "Type the brand this rule applies to");
  }

  const date = (value) => {
    if (value === null || value === "") return null;
    if (value === undefined) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw requestError(400, "That date is not valid");
    }
    return parsed;
  };

  const startsAt = date(body.startsAt ?? current.startsAt ?? null);
  const endsAt = date(body.endsAt ?? current.endsAt ?? null);
  if (startsAt && endsAt && startsAt > endsAt) {
    throw requestError(400, "The rule cannot end before it starts");
  }

  return {
    name,
    description: text(body.description ?? current.description, 300),
    active: body.active === undefined ? current.active !== false : Boolean(body.active),
    scope,
    categories: scope === "category" ? categories : [],
    listings: scope === "product" ? listings : [],
    brand: scope === "brand" ? brand : "",
    earnMode,
    value,
    minSpend: Math.max(0, Number(body.minSpend ?? current.minSpend ?? 0) || 0),
    maxPointsPerOrder: Math.max(
      0,
      Number(body.maxPointsPerOrder ?? current.maxPointsPerOrder ?? 0) || 0,
    ),
    priority: Math.trunc(Number(body.priority ?? current.priority ?? 0) || 0),
    startsAt,
    endsAt,
  };
};

module.exports.listLoyaltyRules = async (_req, res) => {
  try {
    const store = await storeId();
    const rules = await OnlineLoyaltyRule.find({ store })
      .sort({ priority: -1, createdAt: 1 })
      .lean();
    return res.status(200).json({ rules });
  } catch (error) {
    return fail(res, error, "Could not load the rules");
  }
};

module.exports.createLoyaltyRule = async (req, res) => {
  try {
    const store = await storeId();
    const rule = await OnlineLoyaltyRule.create({
      ...ruleFields(req.body),
      store,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    await logActivity({
      action: "Loyalty Rule Created",
      description: `Reward rule "${rule.name}" created.`,
      entity: "loyaltyRule",
      entityId: rule._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });
    return res.status(201).json({ message: "Rule created", rule });
  } catch (error) {
    return fail(res, error, "Could not create the rule");
  }
};

module.exports.updateLoyaltyRule = async (req, res) => {
  try {
    const store = await storeId();
    const current = await OnlineLoyaltyRule.findOne({
      _id: req.params.id,
      store,
    });
    if (!current) throw requestError(404, "Rule not found");

    Object.assign(current, ruleFields(req.body, current.toObject()), {
      updatedBy: req.user?._id || null,
    });
    await current.save();

    await logActivity({
      action: "Loyalty Rule Updated",
      description: `Reward rule "${current.name}" updated.`,
      entity: "loyaltyRule",
      entityId: current._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });
    return res.status(200).json({ message: "Rule saved", rule: current });
  } catch (error) {
    return fail(res, error, "Could not save the rule");
  }
};

module.exports.deleteLoyaltyRule = async (req, res) => {
  try {
    const store = await storeId();
    const rule = await OnlineLoyaltyRule.findOneAndDelete({
      _id: req.params.id,
      store,
    });
    if (!rule) throw requestError(404, "Rule not found");

    await logActivity({
      action: "Loyalty Rule Deleted",
      description: `Reward rule "${rule.name}" deleted.`,
      entity: "loyaltyRule",
      entityId: rule._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });
    // Ledger rows written under this rule keep the name they were written with,
    // so deleting it never rewrites anybody's history.
    return res.status(200).json({ message: "Rule deleted" });
  } catch (error) {
    return fail(res, error, "Could not delete the rule");
  }
};

module.exports.refreshOrderStats = refreshOrderStats;
module.exports.publicCustomer = publicCustomer;
module.exports.trackerFor = trackerFor;
module.exports.STATUS_LABELS = STATUS_LABELS;
