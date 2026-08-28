const mongoose = require("mongoose");
const Deal = require("../models/Dealmodel");
const Product = require("../models/Productmodel");
const logActivity = require("../libs/logger");

// Normalise the incoming items into { product, quantity } with valid ids and
// no duplicates (a repeated product just raises its required quantity).
const normaliseItems = (raw) => {
  const map = new Map();

  (Array.isArray(raw) ? raw : []).forEach((entry) => {
    const id = String(entry?.product || entry?._id || entry || "").trim();
    if (!mongoose.isValidObjectId(id)) return;
    const quantity = Math.max(1, Math.floor(Number(entry?.quantity || 1)) || 1);
    map.set(id, (map.get(id) || 0) + quantity);
  });

  return [...map.entries()].map(([product, quantity]) => ({ product, quantity }));
};

const dealUnitCount = (items) =>
  (Array.isArray(items) ? items : []).reduce(
    (sum, item) => sum + Math.max(1, Math.floor(Number(item.quantity || 1)) || 1),
    0
  );

// A percentage over 100 would hand money back, so it is rejected outright.
const validateDiscount = (discount, discountType) => {
  const amount = Number(discount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "Deal discount must be greater than zero";
  }
  if (
    discountType !== undefined &&
    !["amount", "percent", "setPrice"].includes(discountType)
  ) {
    return "Deal discount type must be amount, percent or setPrice";
  }
  if (discountType === "percent" && amount > 100) {
    return "A percentage deal cannot exceed 100%";
  }

  return null;
};

const QUANTITY_RULES = ["repeat_sets", "single_set"];

// An unrecognised rule becomes absent rather than wrong: the matcher reads
// absence as "whatever this mode always did", which is the safe answer.
const normaliseRule = (value) =>
  QUANTITY_RULES.includes(value) ? value : undefined;

// Blank clears the date; anything unparseable is treated as not set rather than
// stored as an Invalid Date that would silently switch the deal off.
const parseDate = (value) => {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

// Shared creation logic. Both the direct endpoint and the approval executor go
// through here, so an approved deal is identical to a directly-created one.
module.exports.createDealRecord = async (
  {
    name,
    discount,
    discountType = "amount",
    items,
    mode = "bundle",
    groupQuantity = 0,
    quantityRule,
    startsAt,
    endsAt,
  },
  actor = {}
) => {
  if (!name || !String(name).trim()) {
    return { ok: false, status: 400, message: "Deal name is required" };
  }

  const invalid = validateDiscount(discount, discountType);
  if (invalid) {
    return { ok: false, status: 400, message: invalid };
  }

  const dealMode = mode === "mix" ? "mix" : "bundle";
  const groupSize = Math.floor(Number(groupQuantity || 0));

  const cleanItems = normaliseItems(items);
  if (dealMode === "mix") {
    // Pick-any-N: the list is what qualifies, the number is the whole rule.
    if (!cleanItems.length) {
      return { ok: false, status: 400, message: "Pick at least one product for the deal" };
    }
    if (!Number.isFinite(groupSize) || groupSize < 2) {
      return { ok: false, status: 400, message: "Set how many to buy — at least two" };
    }
  } else if (dealUnitCount(cleanItems) < 2) {
    return { ok: false, status: 400, message: "Pick at least two units or products for the deal" };
  }

  // Every product must actually exist.
  const found = await Product.countDocuments({
    _id: { $in: cleanItems.map((item) => item.product) },
  });
  if (found !== cleanItems.length) {
    return { ok: false, status: 400, message: "One or more products no longer exist" };
  }

  const deal = await Deal.create({
    name: String(name).trim(),
    discount: Number(discount),
    discountType,
    mode: dealMode,
    groupQuantity: dealMode === "mix" ? groupSize : 0,
    quantityRule: normaliseRule(quantityRule),
    startsAt: parseDate(startsAt),
    endsAt: parseDate(endsAt),
    items: cleanItems,
    createdBy: actor._id,
  });

  await deal.populate("items.product", "name Price barcode");

  await logActivity({
    action: "Create Deal",
    description: `Deal "${deal.name}" created.`,
    entity: "product",
    entityId: deal._id,
    userId: actor._id,
    ipAddress: actor.ip,
  });

  return { ok: true, message: "Deal created successfully", deal };
};

module.exports.createDeal = async (req, res) => {
  try {
    const result = await module.exports.createDealRecord(req.body, {
      _id: req.user?._id,
      ip: req.ip,
    });

    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }

    return res.status(201).json({ message: result.message, deal: result.deal });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Error creating deal" });
  }
};

module.exports.getDeals = async (req, res) => {
  try {
    const deals = await Deal.find({})
      .sort({ createdAt: -1 })
      .populate("items.product", "name Price barcode");

    return res.status(200).json({ deals });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching deals", error: error.message });
  }
};

module.exports.updateDeal = async (req, res) => {
  try {
    const { dealId } = req.params;
    if (!mongoose.isValidObjectId(dealId)) {
      return res.status(400).json({ message: "Invalid deal id" });
    }

    const deal = await Deal.findById(dealId);
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    const {
      name,
      discount,
      discountType,
      items,
      active,
      // `mode` and `groupQuantity` used to be dropped here, so a deal's type
      // could never be edited once created — the only way to turn a bundle into
      // a pick-any-N was to delete it and start again.
      mode,
      groupQuantity,
      quantityRule,
      startsAt,
      endsAt,
    } = req.body;

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({ message: "Deal name is required" });
      }
      deal.name = String(name).trim();
    }

    if (discount !== undefined || discountType !== undefined) {
      // Validate the pair together — switching to percent with the old amount
      // still has to satisfy the 100% cap.
      const nextType = discountType !== undefined ? discountType : deal.discountType;
      const nextAmount = discount !== undefined ? discount : deal.discount;

      const invalid = validateDiscount(nextAmount, nextType);
      if (invalid) {
        return res.status(400).json({ message: invalid });
      }

      deal.discount = Number(nextAmount);
      deal.discountType = nextType;
    }

    // Mode, list and group size decide each other's validity, so they are
    // resolved together against whatever the deal already holds and checked as
    // one — editing only the mode must not leave a mix deal with no number, and
    // editing only the list must not be judged by the wrong mode's rule.
    const nextMode =
      mode === undefined ? deal.mode : mode === "mix" ? "mix" : "bundle";
    const nextItems = items === undefined ? deal.items : normaliseItems(items);
    const nextGroup =
      groupQuantity === undefined
        ? Number(deal.groupQuantity || 0)
        : Math.floor(Number(groupQuantity || 0));

    if (nextMode === "mix") {
      if (!nextItems.length) {
        return res.status(400).json({ message: "Pick at least one product for the deal" });
      }
      if (!Number.isFinite(nextGroup) || nextGroup < 2) {
        return res.status(400).json({ message: "Set how many to buy — at least two" });
      }
    } else if (dealUnitCount(nextItems) < 2) {
      return res.status(400).json({ message: "Pick at least two units or products for the deal" });
    }

    if (items !== undefined) {
      const found = await Product.countDocuments({
        _id: { $in: nextItems.map((item) => item.product) },
      });
      if (found !== nextItems.length) {
        return res.status(400).json({ message: "One or more products no longer exist" });
      }
      deal.items = nextItems;
    }

    deal.mode = nextMode;
    deal.groupQuantity = nextMode === "mix" ? nextGroup : 0;

    if (quantityRule !== undefined) {
      deal.quantityRule = normaliseRule(quantityRule);
    }
    if (startsAt !== undefined) {
      deal.startsAt = parseDate(startsAt) || null;
    }
    if (endsAt !== undefined) {
      deal.endsAt = parseDate(endsAt) || null;
    }

    if (active !== undefined) {
      deal.active = Boolean(active);
    }

    await deal.save();
    await deal.populate("items.product", "name Price barcode");

    await logActivity({
      action: "Update Deal",
      description: `Deal "${deal.name}" updated.`,
      entity: "product",
      entityId: deal._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    return res.status(200).json({ message: "Deal updated", deal });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Error updating deal" });
  }
};

module.exports.removeDeal = async (req, res) => {
  try {
    const deleted = await Deal.findByIdAndDelete(req.params.dealId);

    if (!deleted) {
      return res.status(404).json({ message: "Deal not found" });
    }

    await logActivity({
      action: "Delete Deal",
      description: `Deal "${deleted.name}" deleted.`,
      entity: "product",
      entityId: deleted._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    return res.status(200).json({ message: "Deal deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Error deleting deal", error: error.message });
  }
};
