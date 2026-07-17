const mongoose = require("mongoose");
const Reorder = require("../models/Reordermodel");
const Product = require("../models/Productmodel");
const Store = require("../models/Storemodel");
const User = require("../models/Usermodel");
const logActivity = require("../libs/logger");
const { isMailConfigured, sendMail, brandedHtml, esc } = require("../libs/mailer");

const DEFAULT_LOW_STOCK = 10;

// Suggest an order size that lifts stock comfortably back above the threshold,
// never less than 1.
const suggestQuantity = (product) => {
  const threshold = Number(product.lowStockThreshold ?? DEFAULT_LOW_STOCK) || DEFAULT_LOW_STOCK;
  const current = Number(product.quantity || 0);
  return Math.max(threshold * 2 - current, threshold, 1);
};

// Where the "please approve a reorder" reminder goes: the shop's configured
// notifications email, or the owner's login email as a fallback.
const reminderRecipient = async (shop) => {
  if (shop?.notificationsEmail) return shop.notificationsEmail;
  const owner = await User.findOne({ role: "superadmin" }).select("email").lean();
  return owner?.email || "";
};

// Called from the low‑stock hook after a sale. Raises a pending reorder for the
// product (one at a time, thanks to the partial unique index) and emails the
// shop a reminder to approve it. Entirely best‑effort — never throws.
const raiseReorderForProduct = async (productId) => {
  try {
    const product = await Product.findById(productId).populate("supplier", "name contactInfo");
    if (!product) return;

    // Already an open reorder for this item? Leave it — don't stack duplicates.
    const existing = await Reorder.findOne({ product: product._id, status: "pending" });
    if (existing) return;

    const supplier = product.supplier;
    const reorder = await Reorder.create({
      product: product._id,
      productName: product.name,
      supplier: supplier?._id || null,
      supplierName: supplier?.name || "",
      supplierEmail: supplier?.contactInfo?.email || "",
      currentQuantity: Number(product.quantity || 0),
      threshold: Number(product.lowStockThreshold ?? DEFAULT_LOW_STOCK),
      quantity: suggestQuantity(product),
    });

    // Reminder email to the shop (best effort).
    if (isMailConfigured()) {
      const shop = await Store.findOne({ key: "shop" }).lean();
      const to = await reminderRecipient(shop);
      if (to) {
        const appUrl = process.env.APP_URL || "";
        const cta = appUrl
          ? `<p><a href="${esc(appUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;">Open dashboard to approve</a></p>`
          : `<p>Log in to your dashboard to review and approve it.</p>`;
        const body = `
          <p><strong>Low stock — a reorder is waiting for approval.</strong></p>
          <p><strong>${esc(product.name)}</strong> has dropped to <strong>${reorder.currentQuantity}</strong> unit(s)
          (threshold ${reorder.threshold}).</p>
          <p>Suggested order: <strong>${reorder.quantity}</strong> unit(s)${
            reorder.supplierName ? ` from <strong>${esc(reorder.supplierName)}</strong>` : ""
          }.</p>
          ${cta}
          <p style="color:#6b7280;font-size:12px;">No supplier email is sent until you approve.</p>`;
        const result = await sendMail({
          to,
          fromName: shop?.name,
          subject: `Approve reorder — ${product.name}`,
          html: brandedHtml(shop, body),
        });
        if (result.ok) {
          reorder.reminderSentAt = new Date();
          await reorder.save();
        }
      }
    }
  } catch (error) {
    // A duplicate-key race just means another sale raised it first — ignore.
    if (error?.code !== 11000) {
      console.error("[reorder] raise failed:", error.message);
    }
  }
};

// ── Owner/admin views the queue ─────────────────────────────────────────────
module.exports.getReorders = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const reorders = await Reorder.find(filter).sort({ status: 1, createdAt: -1 }).limit(500);
    const pending = await Reorder.countDocuments({ status: "pending" });
    return res.status(200).json({ reorders, pending });
  } catch (error) {
    return res.status(500).json({ message: "Could not load reorders", error: error.message });
  }
};

// Adjust the quantity before approving.
module.exports.updateReorder = async (req, res) => {
  try {
    const reorder = await Reorder.findById(req.params.id);
    if (!reorder) return res.status(404).json({ message: "Reorder not found" });
    if (reorder.status !== "pending") {
      return res.status(400).json({ message: `This reorder is already ${reorder.status}` });
    }
    const qty = Math.floor(Number(req.body?.quantity));
    if (!Number.isFinite(qty) || qty < 1) {
      return res.status(400).json({ message: "Quantity must be at least 1" });
    }
    reorder.quantity = qty;
    if (typeof req.body?.note === "string") reorder.note = req.body.note;
    await reorder.save();
    return res.status(200).json({ message: "Reorder updated", reorder });
  } catch (error) {
    return res.status(500).json({ message: "Could not update reorder", error: error.message });
  }
};

// ── Approve → email the supplier ────────────────────────────────────────────
module.exports.approveReorder = async (req, res) => {
  try {
    const reorder = await Reorder.findById(req.params.id);
    if (!reorder) return res.status(404).json({ message: "Reorder not found" });
    if (reorder.status !== "pending") {
      return res.status(400).json({ message: `This reorder is already ${reorder.status}` });
    }
    if (!reorder.supplierEmail) {
      return res.status(400).json({
        message: "This product's supplier has no email address — add one on the supplier, then approve.",
      });
    }
    if (!isMailConfigured()) {
      return res.status(503).json({
        message: "Email is not configured on the server yet, so the supplier order can't be sent.",
      });
    }

    const shop = await Store.findOne({ key: "shop" }).lean();
    const body = `
      <p><strong>Purchase Order</strong></p>
      <p>Dear ${esc(reorder.supplierName || "Supplier")},</p>
      <p>Please supply the following:</p>
      <table style="border-collapse:collapse;margin:8px 0;">
        <tr>
          <td style="border:1px solid #e5e7eb;padding:8px 14px;"><strong>${esc(reorder.productName)}</strong></td>
          <td style="border:1px solid #e5e7eb;padding:8px 14px;">Qty: <strong>${reorder.quantity}</strong></td>
        </tr>
      </table>
      ${reorder.note ? `<p>${esc(reorder.note)}</p>` : ""}
      <p>Kind regards,<br/>${esc(shop?.name || "The shop")}</p>`;

    const result = await sendMail({
      to: reorder.supplierEmail,
      fromName: shop?.name,
      subject: `Purchase Order — ${reorder.productName} (${shop?.name || "Order"})`,
      html: brandedHtml(shop, body),
    });

    if (!result.ok) {
      reorder.emailError = result.error || result.reason || "send failed";
      await reorder.save();
      return res.status(502).json({
        message: "Could not send the supplier email — please try again.",
        error: reorder.emailError,
      });
    }

    reorder.status = "sent";
    reorder.emailSentAt = new Date();
    reorder.emailError = "";
    reorder.approvedBy = req.user._id;
    reorder.approvedByName = req.user.name;
    await reorder.save();

    await logActivity({
      action: "Approve Reorder",
      description: `Ordered ${reorder.quantity} × ${reorder.productName} from ${reorder.supplierName || "supplier"}.`,
      entity: "order",
      userId: req.user._id,
      ipAddress: req.ip,
    });

    return res.status(200).json({ message: "Order emailed to the supplier", reorder });
  } catch (error) {
    return res.status(500).json({ message: "Could not approve reorder", error: error.message });
  }
};

module.exports.rejectReorder = async (req, res) => {
  try {
    const reorder = await Reorder.findById(req.params.id);
    if (!reorder) return res.status(404).json({ message: "Reorder not found" });
    if (reorder.status !== "pending") {
      return res.status(400).json({ message: `This reorder is already ${reorder.status}` });
    }
    reorder.status = "rejected";
    reorder.approvedBy = req.user._id;
    reorder.approvedByName = req.user.name;
    if (typeof req.body?.note === "string") reorder.note = req.body.note;
    await reorder.save();
    return res.status(200).json({ message: "Reorder dismissed", reorder });
  } catch (error) {
    return res.status(500).json({ message: "Could not reject reorder", error: error.message });
  }
};

module.exports.raiseReorderForProduct = raiseReorderForProduct;
