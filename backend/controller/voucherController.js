const Voucher = require("../models/Vouchermodel");
const logActivity = require("../libs/logger");

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

module.exports.createVoucher = async (req, res) => {
  try {
    const { code, type, value, minSpend, expiresAt, usageLimit } = req.body;

    if (!code || !String(code).trim()) {
      return res.status(400).json({ message: "Voucher code is required" });
    }

    if (type !== "amount" && type !== "percent") {
      return res.status(400).json({ message: "Voucher type must be amount or percent" });
    }

    const amount = Number(value);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Voucher value must be greater than zero" });
    }

    if (type === "percent" && amount > 100) {
      return res.status(400).json({ message: "A percent voucher cannot exceed 100" });
    }

    const voucher = await Voucher.create({
      code: String(code).trim().toUpperCase(),
      type,
      value: amount,
      minSpend: Number(minSpend || 0),
      expiresAt: expiresAt || undefined,
      usageLimit: Number(usageLimit || 1),
      createdBy: req.user?._id,
    });

    await logActivity({
      action: "Create Voucher",
      description: `Voucher ${voucher.code} created.`,
      entity: "voucher",
      entityId: voucher._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    return res.status(201).json({ message: "Voucher created successfully", voucher });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "A voucher with this code already exists" });
    }
    return res.status(500).json({ message: error.message || "Error creating voucher" });
  }
};

module.exports.getVouchers = async (req, res) => {
  try {
    const vouchers = await Voucher.find({}).sort({ createdAt: -1 });

    // Surface expiry without needing a background job.
    const now = Date.now();
    const withState = vouchers.map((voucher) => {
      const expired =
        voucher.status === "active" && voucher.expiresAt && voucher.expiresAt.getTime() < now;
      return { ...voucher.toObject(), status: expired ? "expired" : voucher.status };
    });

    return res.status(200).json({ vouchers: withState });
  } catch (error) {
    return res.status(500).json({ message: "Error fetching vouchers", error: error.message });
  }
};

// What the till caches so a customer's voucher still works when the line is
// down. Only live codes, and only the fields needed to price one — never the
// audit trail.
//
// Trade-off worth knowing: this puts the live voucher codes on the till, so a
// cashier with developer tools could read them. That is the price of honouring
// vouchers offline. It is bounded: every code is single-use, each redemption is
// recorded against a receipt, and an offline redemption of an already-spent code
// is flagged for the admin.
module.exports.getActiveVouchers = async (req, res) => {
  try {
    const now = new Date();

    const vouchers = await Voucher.find({
      status: "active",
      $expr: { $lt: ["$usedCount", "$usageLimit"] },
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }],
    }).select("code type value minSpend expiresAt");

    return res.status(200).json({ vouchers });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error fetching vouchers", error: error.message });
  }
};

module.exports.disableVoucher = async (req, res) => {
  try {
    const voucher = await Voucher.findByIdAndUpdate(
      req.params.voucherId,
      { status: "disabled" },
      { new: true }
    );

    if (!voucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    await logActivity({
      action: "Disable Voucher",
      description: `Voucher ${voucher.code} disabled.`,
      entity: "voucher",
      entityId: voucher._id,
      userId: req.user?._id,
      ipAddress: req.ip,
    });

    return res.status(200).json({ message: "Voucher disabled", voucher });
  } catch (error) {
    return res.status(500).json({ message: "Error disabling voucher", error: error.message });
  }
};

module.exports.removeVoucher = async (req, res) => {
  try {
    const deleted = await Voucher.findByIdAndDelete(req.params.voucherId);

    if (!deleted) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    return res.status(200).json({ message: "Voucher deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Error deleting voucher", error: error.message });
  }
};

// Called by the till before applying a code. The computed discount depends on
// the cart, so the subtotal travels in the body. The voucher is only actually
// consumed inside the checkout transaction — this is a preview.
module.exports.validateVoucher = async (req, res) => {
  try {
    const { code, subtotal: rawSubtotal } = req.body || {};

    if (!code || !String(code).trim()) {
      return res.status(400).json({ valid: false, message: "Voucher code is required" });
    }

    const subtotal = Number(rawSubtotal || 0);

    const voucher = await Voucher.findOne({
      code: String(code).trim().toUpperCase(),
    });

    if (!voucher) {
      return res.status(404).json({ valid: false, message: "Voucher not found" });
    }

    const reason = voucher.rejectionReason(subtotal);

    if (reason) {
      return res.status(400).json({ valid: false, message: reason });
    }

    return res.status(200).json({
      valid: true,
      code: voucher.code,
      type: voucher.type,
      value: voucher.value,
      computedDiscount: money(voucher.computeDiscount(subtotal)),
    });
  } catch (error) {
    return res.status(500).json({ message: "Error validating voucher", error: error.message });
  }
};
