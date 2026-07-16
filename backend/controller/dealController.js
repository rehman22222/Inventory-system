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

// A percentage over 100 would hand money back, so it is rejected outright.
const validateDiscount = (discount, discountType) => {
  const amount = Number(discount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return "Deal discount must be greater than zero";
  }
  if (discountType !== undefined && discountType !== "amount" && discountType !== "percent") {
    return "Deal discount type must be amount or percent";
  }
  if (discountType === "percent" && amount > 100) {
    return "A percentage deal cannot exceed 100%";
  }

  return null;
};

module.exports.createDeal = async (req, res) => {
  try {
    const { name, discount, discountType = "amount", items } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "Deal name is required" });
    }

    const invalid = validateDiscount(discount, discountType);
    if (invalid) {
      return res.status(400).json({ message: invalid });
    }
    const amount = Number(discount);

    const cleanItems = normaliseItems(items);
    if (cleanItems.length < 2) {
      return res.status(400).json({ message: "Pick at least two products for the deal" });
    }

    // Every product must actually exist.
    const found = await Product.countDocuments({
      _id: { $in: cleanItems.map((item) => item.product) },
    });
    if (found !== cleanItems.length) {
      return res.status(400).json({ message: "One or more products no longer exist" });
    }

    const deal = await Deal.create({
      name: String(name).trim(),
      discount: amount,
      discountType,
      items: cleanItems,
      createdBy: req.user?._id,
    });

    await deal.populate("items.product", "name Price barcode");

    await logActivity({
      action: "Create Deal",
      description: `Deal "${deal.name}" created.`,
      entity: "product",
      entityId: deal._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    return res.status(201).json({ message: "Deal created successfully", deal });
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

    const { name, discount, discountType, items, active } = req.body;

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

    if (items !== undefined) {
      const cleanItems = normaliseItems(items);
      if (cleanItems.length < 2) {
        return res.status(400).json({ message: "Pick at least two products for the deal" });
      }
      deal.items = cleanItems;
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
