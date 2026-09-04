// Loyalty points — what a basket earns, what a balance is worth, and every
// movement of the two.
//
// Shared by the storefront checkout, the admin's order screen and the customer's
// own account page, so all three agree to the point. Nothing in here writes to
// the database except the ledger functions at the bottom; everything above them
// is pure arithmetic and can be called to PREVIEW an order safely.
//
// Two rules govern the whole file:
//
//   1. Points are whole numbers. Always. A programme that awards 3.7 points is
//      one that will eventually be asked to explain 0.7 of a point to somebody.
//      Every earning is floored — the shop never rounds up into a liability by
//      accident, and never quietly rounds in its own favour either.
//
//   2. Nothing is spendable until the goods have arrived. An earning is written
//      `pending` when the order is placed and only confirmed on delivery, so an
//      order cancelled the same afternoon never funded a discount on somebody
//      else's basket in the meantime.

const mongoose = require("mongoose");
const OnlineLoyaltyEntry = require("../models/OnlineLoyaltyEntrymodel");
const OnlineCustomer = require("../models/OnlineCustomermodel");
const OnlineLoyaltyRule = require("../models/OnlineLoyaltyRulemodel");

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
// Down, never up: see rule 1 above.
const wholePoints = (value) =>
  Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

const opts = (session) => (session ? { session } : {});

/* ── Programme configuration ────────────────────────────────────────────── */

// The programme's settings with every gap filled, so no caller has to guard
// against a shop that has enabled loyalty but not finished configuring it.
const programme = (settings) => {
  const raw = settings?.loyalty || {};
  const earnRate = Number(raw.earnRate);
  const redeemRate = Number(raw.redeemRate);
  return {
    enabled: Boolean(raw.enabled),
    programName: raw.programName || "Rewards",
    pointsName: raw.pointsName || "points",
    earnRate: Number.isFinite(earnRate) && earnRate >= 0 ? earnRate : 1,
    earnOnShipping: Boolean(raw.earnOnShipping),
    // Never zero: it is a divisor, and a shop that types 0 here means "off",
    // not "every point is worth infinite money".
    redeemRate: Number.isFinite(redeemRate) && redeemRate > 0 ? redeemRate : 100,
    minRedeemPoints: Math.max(0, Number(raw.minRedeemPoints) || 0),
    maxRedeemPercent: Math.min(
      100,
      Math.max(0, Number(raw.maxRedeemPercent ?? 50)),
    ),
    signupBonus: Math.max(0, Number(raw.signupBonus) || 0),
    reviewBonus: Math.max(0, Number(raw.reviewBonus) || 0),
    expiryMonths: Math.max(0, Number(raw.expiryMonths) || 0),
    tiers: Array.isArray(raw.tiers) ? raw.tiers : [],
    terms: raw.terms || "",
  };
};

// Which tier a lifetime total sits in, and what is next.
//
// Lifetime, not balance — spending a reward must never cost somebody their
// standing. Thresholds are sorted here rather than trusted from the database,
// because the admin can enter them in any order and a mis-sorted list would
// silently hand everybody the first tier that happened to match.
const tierFor = (settings, lifetimePoints) => {
  const config = programme(settings);
  const lifetime = Math.max(0, Number(lifetimePoints) || 0);
  const tiers = config.tiers
    .filter((tier) => tier && tier.name)
    .map((tier) => ({
      name: String(tier.name),
      threshold: Math.max(0, Number(tier.threshold) || 0),
      multiplier:
        Number.isFinite(Number(tier.multiplier)) && Number(tier.multiplier) > 0
          ? Number(tier.multiplier)
          : 1,
      perk: tier.perk || "",
    }))
    .sort((a, b) => a.threshold - b.threshold);

  if (!tiers.length) {
    return { current: null, next: null, multiplier: 1, progress: 0, tiers: [] };
  }

  let current = null;
  let next = null;
  for (const tier of tiers) {
    if (lifetime >= tier.threshold) current = tier;
    else if (!next) next = tier;
  }

  // How far through the current band they are, as a 0–1 fraction, so the
  // account page can draw a progress bar without repeating this sum.
  let progress = 1;
  if (next) {
    const floor = current?.threshold || 0;
    const span = Math.max(1, next.threshold - floor);
    progress = Math.min(1, Math.max(0, (lifetime - floor) / span));
  }

  return { current, next, multiplier: current?.multiplier ?? 1, progress, tiers };
};

/* ── Rule matching ──────────────────────────────────────────────────────── */

const withinWindow = (rule, now) => {
  if (rule.startsAt && now < new Date(rule.startsAt).getTime()) return false;
  if (rule.endsAt && now > new Date(rule.endsAt).getTime()) return false;
  return true;
};

// Does this rule cover this basket line?
//
// `line.listing` is the full listing document resolved at checkout, so every
// test here reads server-owned catalogue data — a browser cannot claim its
// basket is full of best sellers.
const ruleCoversLine = (rule, line) => {
  const listing = line.listing || {};
  switch (rule.scope) {
    case "all":
      return true;
    case "product":
      return (rule.listings || []).map(String).includes(String(listing._id));
    case "category": {
      const wanted = new Set((rule.categories || []).map(String));
      const owned = [listing.category, ...(listing.categories || [])]
        .filter(Boolean)
        .map(String);
      return owned.some((id) => wanted.has(id));
    }
    case "best_sellers":
      // The same "bestseller" tag that puts a product in the storefront's best
      // sellers row. One curated list, used twice.
      return (listing.tags || []).includes("bestseller");
    case "brand":
      return (
        Boolean(rule.brand) &&
        String(listing.brand || "").trim().toLowerCase() ===
          String(rule.brand).trim().toLowerCase()
      );
    default:
      // "order" is not a line rule at all.
      return false;
  }
};

// The rule that wins for a line: highest priority, then whichever was written
// first. They do not stack — see the note on the rule model.
const bestRuleForLine = (rules, line, amount) => {
  let winner = null;
  for (const rule of rules) {
    if (rule.scope === "order") continue;
    if (amount < Number(rule.minSpend || 0)) continue;
    if (!ruleCoversLine(rule, line)) continue;
    const better =
      !winner ||
      Number(rule.priority || 0) > Number(winner.priority || 0) ||
      (Number(rule.priority || 0) === Number(winner.priority || 0) &&
        new Date(rule.createdAt || 0) < new Date(winner.createdAt || 0));
    if (better) winner = rule;
  }
  return winner;
};

// Points one rule (or the base rate, when `rule` is null) gives for one line.
const rawPointsForLine = (config, rule, amount, quantity) => {
  if (!rule) return config.earnRate * amount;
  const value = Number(rule.value) || 0;
  switch (rule.earnMode) {
    case "per_unit":
      return value * quantity;
    case "multiplier":
      return config.earnRate * amount * value;
    case "fixed":
      return value;
    case "per_currency":
    default:
      return value * amount;
  }
};

/* ── What a basket earns ────────────────────────────────────────────────── */

/**
 * Price a basket in points, without touching the database.
 *
 * lines    — resolved checkout lines (see resolveOrderLines): each carries its
 *            full `listing`, its `quantity` and its `lineTotal`.
 * shipping — charged shipping, counted only if the programme says so.
 * tierMultiplier — the shopper's tier bonus; 1 for everybody else.
 *
 * Returns { points, breakdown }, the breakdown being the workings in the shape
 * the ledger stores them, so a customer can always be shown why.
 */
const quoteEarning = ({
  settings,
  rules = [],
  lines = [],
  shipping = 0,
  tierMultiplier = 1,
  now = new Date(),
}) => {
  const config = programme(settings);
  if (!config.enabled) return { points: 0, breakdown: [] };

  const live = (rules || []).filter(
    (rule) => rule && rule.active !== false && withinWindow(rule, now.getTime()),
  );
  const multiplier =
    Number.isFinite(Number(tierMultiplier)) && Number(tierMultiplier) > 0
      ? Number(tierMultiplier)
      : 1;

  // Pass one: raw points per line, remembering which rule produced each so the
  // per-rule ceilings can be applied afterwards.
  const rows = [];
  for (const line of lines) {
    const amount = round2(line.lineTotal ?? line.subtotal ?? 0);
    if (amount <= 0) continue;
    const rule = bestRuleForLine(live, line, amount);
    const raw =
      rawPointsForLine(config, rule, amount, Number(line.quantity) || 0) *
      multiplier;
    if (raw <= 0) continue;
    rows.push({
      ruleId: rule ? String(rule._id) : "",
      rule: rule ? rule.name : "",
      maxPerOrder: rule ? Number(rule.maxPointsPerOrder || 0) : 0,
      name: line.name,
      listing: line.listing?._id || null,
      amount,
      raw,
    });
  }

  // Shipping, when the shop chooses to reward it. Always at the base rate: a
  // "double points on e-liquid" promotion was never about the courier.
  const shippingAmount = round2(shipping);
  if (config.earnOnShipping && shippingAmount > 0) {
    const raw = config.earnRate * shippingAmount * multiplier;
    if (raw > 0) {
      rows.push({
        ruleId: "",
        rule: "",
        maxPerOrder: 0,
        name: "Delivery",
        listing: null,
        amount: shippingAmount,
        raw,
      });
    }
  }

  // Pass two: a rule's ceiling applies across the whole order, so a basket of
  // twenty qualifying items cannot walk past a cap set per rule. Where a group
  // is over its cap, every line in it is scaled down by the same fraction —
  // which keeps the breakdown honest about where the points came from.
  const totals = new Map();
  for (const row of rows) {
    if (!row.ruleId || !row.maxPerOrder) continue;
    totals.set(row.ruleId, (totals.get(row.ruleId) || 0) + row.raw);
  }
  for (const row of rows) {
    const total = totals.get(row.ruleId);
    if (total && total > row.maxPerOrder) {
      row.raw = row.raw * (row.maxPerOrder / total);
    }
  }

  const breakdown = rows
    .map((row) => ({
      name: row.name,
      listing: row.listing,
      rule: row.rule,
      amount: row.amount,
      points: wholePoints(row.raw),
    }))
    .filter((row) => row.points > 0);

  // Order-level bonuses, added on top. These DO stack with the line earnings —
  // that is what "spend €50, get 100 points" means — but they take the base
  // rate rather than the tier multiplier, so a flat promotion stays flat and
  // reads the same to every shopper it is offered to.
  const merchandise = round2(
    lines.reduce(
      (sum, line) => sum + Number(line.lineTotal ?? line.subtotal ?? 0),
      0,
    ),
  );
  const orderBasis = round2(
    merchandise + (config.earnOnShipping ? shippingAmount : 0),
  );
  for (const rule of live) {
    if (rule.scope !== "order") continue;
    if (orderBasis < Number(rule.minSpend || 0)) continue;
    let raw;
    switch (rule.earnMode) {
      case "per_currency":
        raw = Number(rule.value || 0) * orderBasis;
        break;
      case "multiplier":
        raw = config.earnRate * orderBasis * Number(rule.value || 0);
        break;
      // "per unit" has no meaning for a whole order; a flat bonus is what the
      // shop meant either way.
      case "per_unit":
      case "fixed":
      default:
        raw = Number(rule.value || 0);
    }
    const cap = Number(rule.maxPointsPerOrder || 0);
    if (cap > 0) raw = Math.min(raw, cap);
    const points = wholePoints(raw);
    if (points > 0) {
      breakdown.push({
        name: rule.name,
        listing: null,
        rule: rule.name,
        amount: orderBasis,
        points,
      });
    }
  }

  return {
    points: breakdown.reduce((sum, row) => sum + row.points, 0),
    breakdown,
  };
};

/* ── What a balance is worth ────────────────────────────────────────────── */

/**
 * How many points may actually be spent on this basket, and what they take off.
 *
 * Everything is clamped rather than refused: a shopper who asks to spend more
 * than they have, or more than the programme allows on one order, gets the most
 * they are allowed — not an error about a limit they were never shown. The one
 * exception is a request under the minimum, refused outright so nobody burns 40
 * points for four cents without meaning to.
 */
const quoteRedemption = ({
  settings,
  balance = 0,
  merchandiseTotal = 0,
  requestedPoints = 0,
}) => {
  const config = programme(settings);
  const available = Math.max(0, Math.floor(Number(balance) || 0));
  const requested = Math.max(0, Math.floor(Number(requestedPoints) || 0));
  const basket = round2(merchandiseTotal);

  if (!config.enabled || requested <= 0 || available <= 0 || basket <= 0) {
    return { points: 0, value: 0, reason: "" };
  }
  if (requested < config.minRedeemPoints) {
    return {
      points: 0,
      value: 0,
      reason: `You need at least ${config.minRedeemPoints} ${config.pointsName} to use them`,
    };
  }

  // Never more than they hold, and never more than the programme lets one order
  // absorb.
  const spendCeiling = round2((basket * config.maxRedeemPercent) / 100);
  const pointsCeiling = Math.floor(spendCeiling * config.redeemRate);
  const points = Math.min(requested, available, pointsCeiling);

  if (points < config.minRedeemPoints) {
    return {
      points: 0,
      value: 0,
      reason: `This order can take at most ${pointsCeiling} ${config.pointsName}`,
    };
  }

  // Floor to the cent. The shop hands back exactly what the points bought and
  // never a cent more than the rate says.
  const value = Math.floor((points / config.redeemRate) * 100) / 100;
  if (value <= 0) return { points: 0, value: 0, reason: "" };

  return { points, value, reason: "" };
};

/* ── Ledger ─────────────────────────────────────────────────────────────────
 * The only functions here that write. Each keeps the customer's cached counters
 * in step with the row it writes, in the same call, so the two cannot drift by
 * more than a crash.
 * ------------------------------------------------------------------------ */

const expiryFrom = (settings, at = new Date()) => {
  const months = programme(settings).expiryMonths;
  if (!months) return null;
  const expires = new Date(at);
  expires.setMonth(expires.getMonth() + months);
  return expires;
};

/**
 * Write a movement and move the customer's cached counters with it.
 *
 * `pending` earnings touch only `points.pending`. Everything else moves the
 * spendable balance, and anything positive and confirmed also raises the
 * lifetime total that decides a tier.
 *
 * `alreadyApplied` is for the one case where the balance was moved BEFORE the
 * row could be written: spending points at checkout, where the deduction has to
 * happen under a condition on the balance itself so two simultaneous checkouts
 * cannot spend the same points twice. The row still has to exist — a balance
 * that dropped with nothing on the statement to show for it is exactly the bug
 * this ledger is here to prevent — but it must not take the points a second
 * time.
 */
const postEntry = async (
  {
    store,
    customer,
    kind,
    points,
    status = "confirmed",
    order = null,
    orderNo = "",
    reason = "",
    breakdown = [],
    value = 0,
    by = null,
    byName = "",
    settings = null,
    alreadyApplied = false,
  },
  session = null,
) => {
  const delta = Math.trunc(Number(points) || 0);
  if (!delta) return null;

  const customerId = customer?._id || customer;

  let updated;
  if (alreadyApplied) {
    // Only read, so `balanceAfter` still records the truth.
    updated = await OnlineCustomer.findById(customerId)
      .select("points")
      .session(session || null);
  } else {
    const inc = {};
    if (status === "pending") {
      inc["points.pending"] = delta;
    } else {
      inc["points.balance"] = delta;
      if (delta > 0) inc["points.lifetime"] = delta;
    }

    // Read the document back AFTER the increment, so `balanceAfter` on the row
    // is the real balance and not a number we hopefully computed beside it.
    updated = await OnlineCustomer.findByIdAndUpdate(
      customerId,
      { $inc: inc },
      { new: true, ...opts(session) },
    );
  }

  const [entry] = await OnlineLoyaltyEntry.create(
    [
      {
        store,
        customer: customerId,
        kind,
        points: delta,
        status,
        balanceAfter: Math.max(0, Number(updated?.points?.balance || 0)),
        order,
        orderNo,
        reason,
        breakdown,
        value: round2(value),
        by,
        byName,
        settledAt: status === "confirmed" ? new Date() : null,
        expiresAt:
          status !== "pending" && delta > 0 && settings
            ? expiryFrom(settings)
            : null,
      },
    ],
    // Mongoose needs `ordered` to create documents inside a session.
    { ...opts(session), ordered: true },
  );

  return entry;
};

/**
 * Move an order's pending earning to spendable. Called when it is delivered.
 *
 * Idempotent through the order's own `loyalty.confirmedAt` stamp, which the
 * caller sets in the same transaction — a retried "mark delivered" cannot pay
 * anybody twice.
 */
const confirmPending = async ({ order, settings }, session = null) => {
  const rows = await OnlineLoyaltyEntry.find({
    order: order._id,
    kind: "earn",
    status: "pending",
  }).session(session || null);

  let confirmed = 0;
  for (const row of rows) {
    const after = await OnlineCustomer.findByIdAndUpdate(
      row.customer,
      {
        $inc: {
          "points.pending": -row.points,
          "points.balance": row.points,
          "points.lifetime": row.points,
        },
      },
      { new: true, ...opts(session) },
    );
    row.status = "confirmed";
    row.settledAt = new Date();
    row.expiresAt = expiryFrom(settings);
    row.balanceAfter = Math.max(0, Number(after?.points?.balance || 0));
    await row.save(opts(session));
    confirmed += row.points;
  }
  return confirmed;
};

/**
 * Undo everything an order did to a balance. Called on cancellation or refund.
 *
 * Two opposite movements, and they are genuinely different:
 *   - an EARNING is taken back, because the goods went back too;
 *   - a REDEMPTION is handed back, because the customer paid with points for
 *     something they did not end up receiving. Keeping those is how a shop
 *     turns a routine cancellation into a complaint.
 *
 * A pending earning is simply written off — it never became spendable, so there
 * is nothing to claw out of a balance somebody may already have spent.
 */
const reverseOrder = async ({ store, order, settings }, session = null) => {
  // Has this order already been undone?
  //
  // The caller's `order.loyalty.reversedAt` stamp is the primary guard, and the
  // status transitions refuse a second cancellation before it even gets here.
  // This is a third, inside the function itself, because a compensating row no
  // longer changes the status of what it compensates for — so without it, a
  // reversal run twice would hand the points back twice.
  const alreadyUndone = await OnlineLoyaltyEntry.exists({
    order: order._id,
    kind: { $in: ["reverse", "refund"] },
  }).session(session || null);
  if (alreadyUndone) return { takenBack: 0, handedBack: 0 };

  const rows = await OnlineLoyaltyEntry.find({
    order: order._id,
    status: { $in: ["pending", "confirmed"] },
    kind: { $in: ["earn", "redeem"] },
  }).session(session || null);

  let takenBack = 0;
  let handedBack = 0;

  for (const row of rows) {
    if (row.kind === "earn") {
      if (row.status === "pending") {
        // Never became real. It only ever sat in `pending`, so writing it off is
        // the whole reversal — there is nothing to compensate for, and marking
        // it keeps it out of every later sum.
        await OnlineCustomer.updateOne(
          { _id: row.customer },
          { $inc: { "points.pending": -row.points } },
          opts(session),
        );
        row.status = "reversed";
        row.settledAt = new Date();
        await row.save(opts(session));
      } else {
        // Already spendable, so it must be taken back with an opposite row —
        // the statement then shows both the earning and its reversal rather
        // than an entry that quietly vanished.
        //
        // The original row KEEPS its confirmed status, and that is not an
        // oversight. A movement is undone EITHER by marking it (pending, above)
        // OR by posting its opposite — never both. Doing both looks tidier and
        // double-counts: the balance would be recomputed as if the earning had
        // never happened AND as if it had been separately clawed back.
        await postEntry(
          {
            store,
            customer: row.customer,
            kind: "reverse",
            points: -row.points,
            order: order._id,
            orderNo: order.orderNo,
            reason: `Points removed — order ${order.orderNo} ${order.status}`,
            settings,
          },
          session,
        );
      }
      takenBack += row.points;
    } else if (row.kind === "redeem" && row.status === "confirmed") {
      // Same rule as above: the compensating row IS the reversal, so the
      // original redemption stays on the statement exactly as it happened.
      await postEntry(
        {
          store,
          customer: row.customer,
          kind: "refund",
          // A redemption row is negative; giving it back is its opposite.
          points: -row.points,
          order: order._id,
          orderNo: order.orderNo,
          reason: `Points returned — order ${order.orderNo} ${order.status}`,
          value: row.value,
          settings,
        },
        session,
      );
      handedBack += Math.abs(row.points);
    }
  }

  return { takenBack, handedBack };
};

// Every live rule for a shop, already in the order they win ties.
const activeRules = (store) =>
  OnlineLoyaltyRule.find({ store, active: true })
    .sort({ priority: -1, createdAt: 1 })
    .lean();

/**
 * Recompute a balance from the ledger and correct the cache if it has drifted.
 *
 * Nothing should ever need this. It exists because a cached total that CANNOT
 * be checked against its ledger is a cached total nobody can defend, and the one
 * time it does drift — a crash between the two writes above — the shop needs a
 * way to put it right that is not a hand-written database update.
 */
const recomputeBalance = async (customerId) => {
  const rows = await OnlineLoyaltyEntry.aggregate([
    { $match: { customer: new mongoose.Types.ObjectId(String(customerId)) } },
    {
      $group: {
        _id: "$status",
        points: { $sum: "$points" },
        earned: { $sum: { $cond: [{ $gt: ["$points", 0] }, "$points", 0] } },
      },
    },
  ]);
  const confirmed = rows.find((row) => row._id === "confirmed");
  const pending = rows.find((row) => row._id === "pending");
  const points = {
    balance: Math.max(0, Number(confirmed?.points || 0)),
    pending: Math.max(0, Number(pending?.points || 0)),
    lifetime: Math.max(0, Number(confirmed?.earned || 0)),
  };
  await OnlineCustomer.updateOne({ _id: customerId }, { $set: { points } });
  return points;
};

module.exports = {
  programme,
  tierFor,
  quoteEarning,
  quoteRedemption,
  postEntry,
  confirmPending,
  reverseOrder,
  activeRules,
  recomputeBalance,
  wholePoints,
  round2,
};
