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

// Don't re-email the shop about the same low product more than once per day.
const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Send the shop the "low stock — approve a reorder" email. Returns true if sent.
const sendReorderReminder = async (product, reorder) => {
  if (!isMailConfigured()) return false;
  const shop = await Store.findOne({ key: "shop" }).lean();
  const to = await reminderRecipient(shop);
  if (!to) return false;

  const appUrl = process.env.APP_URL || "";
  const cta = appUrl
    ? `<p><a href="${esc(appUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;">Open dashboard to approve</a></p>`
    : `<p>Log in to your dashboard to review and approve it.</p>`;
  const body = `
    <p><strong>Low stock — a reorder is waiting for approval.</strong></p>
    <p><strong>${esc(product.name)}</strong> is at <strong>${Number(product.quantity || 0)}</strong> unit(s)
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
  return result.ok;
};

// CASE 1 — immediate, per product. The first time a product is at/below its
// threshold it gets its own reorder and one email to the shop. It never repeats
// for the same open reorder (the daily digest below is the recurring reminder).
// Called from the POS low‑stock hook after a sale, and from the sweep. Best‑
// effort — never throws.
const raiseReorderForProduct = async (productId) => {
  try {
    const product = await Product.findById(productId).populate("supplier", "name contactInfo");
    if (!product) return;

    const threshold = Number(product.lowStockThreshold ?? DEFAULT_LOW_STOCK);
    if (Number(product.quantity || 0) > threshold) return;

    // Already tracked? Leave it — one email per product, not one per check.
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
      threshold,
      quantity: suggestQuantity(product),
    });
    const sent = await sendReorderReminder(product, reorder);
    if (sent) {
      reorder.reminderSentAt = new Date();
      await reorder.save();
    }
  } catch (error) {
    // A duplicate-key race just means another sale raised it first — ignore.
    if (error?.code !== 11000) {
      console.error("[reorder] raise failed:", error.message);
    }
  }
};

// CASE 2 — the 24h digest. ONE email listing every product currently at/below
// its threshold, sent at most once per 24h (tracked on the Store).
const sendLowStockDigest = async () => {
  try {
    if (!isMailConfigured()) return;
    const store = await Store.findOne({ key: "shop" });
    const last = store?.lastLowStockDigestAt ? store.lastLowStockDigestAt.getTime() : 0;
    if (Date.now() - last < REMINDER_INTERVAL_MS) return;

    const to = await reminderRecipient(store);
    if (!to) return;

    const low = await Product.find({
      $expr: { $lte: ["$quantity", { $ifNull: ["$lowStockThreshold", DEFAULT_LOW_STOCK] }] },
    })
      .populate("supplier", "name")
      .select("name quantity lowStockThreshold supplier")
      .lean();
    if (!low.length) return;

    const rows = low
      .map(
        (p) =>
          `<tr>
             <td style="border:1px solid #e5e7eb;padding:6px 12px;">${esc(p.name)}</td>
             <td style="border:1px solid #e5e7eb;padding:6px 12px;text-align:right;">${Number(p.quantity || 0)}</td>
             <td style="border:1px solid #e5e7eb;padding:6px 12px;text-align:right;">${Number(p.lowStockThreshold ?? DEFAULT_LOW_STOCK)}</td>
             <td style="border:1px solid #e5e7eb;padding:6px 12px;">${esc(p.supplier?.name || "—")}</td>
           </tr>`
      )
      .join("");
    const appUrl = process.env.APP_URL || "";
    const cta = appUrl
      ? `<p><a href="${esc(appUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;">Open dashboard</a></p>`
      : "";
    const body = `
      <p><strong>Daily low‑stock summary — ${low.length} product(s) at or below threshold.</strong></p>
      <table style="border-collapse:collapse;margin:8px 0;">
        <tr>
          <th style="border:1px solid #e5e7eb;padding:6px 12px;text-align:left;">Product</th>
          <th style="border:1px solid #e5e7eb;padding:6px 12px;">In stock</th>
          <th style="border:1px solid #e5e7eb;padding:6px 12px;">Threshold</th>
          <th style="border:1px solid #e5e7eb;padding:6px 12px;text-align:left;">Supplier</th>
        </tr>
        ${rows}
      </table>
      ${cta}`;
    const result = await sendMail({
      to,
      fromName: store?.name,
      subject: `Low stock — ${low.length} product(s)`,
      html: brandedHtml(store, body),
    });
    if (result.ok && store) {
      store.lastLowStockDigestAt = new Date();
      await store.save();
    }
  } catch (error) {
    console.error("[reorder] digest failed:", error.message);
  }
};

// Scheduled sweep: give every low product its own reorder + immediate email the
// first time it's seen (case 1, incl. items that went low without a sale), then
// send the once‑a‑day combined digest (case 2).
// CASE 3 — close reorders whose product has recovered.
//
// A pending reorder is the flag that says "this product is short". Nothing ever
// cleared that flag: status only moved when a human approved or rejected it. So
// a shop that simply restocked the shelf — which is the normal way stock comes
// back — left the reorder pending forever, and because raiseReorderForProduct
// skips any product that already has one, that product could never raise a
// reorder or send a low-stock email again. One restock silently disabled the
// alert for that item for good.
//
// Cancelled rather than deleted: the record is a paper trail of what ran short
// and when, and `cancelled` is already in the schema's status enum.
const closeRecoveredReorders = async () => {
  const pending = await Reorder.find({ status: "pending" }).select("product").lean();
  if (!pending.length) return 0;

  const productIds = pending.map((r) => r.product).filter(Boolean);

  // Back above its threshold — the shortage is over.
  const recovered = await Product.find({
    _id: { $in: productIds },
    $expr: { $gt: ["$quantity", { $ifNull: ["$lowStockThreshold", DEFAULT_LOW_STOCK] }] },
  })
    .select("_id")
    .lean();

  // A reorder pointing at a product that no longer exists can never be actioned
  // either, and it holds the same per-product lock.
  const alive = await Product.find({ _id: { $in: productIds } }).select("_id").lean();
  const aliveIds = new Set(alive.map((p) => String(p._id)));
  const orphaned = productIds.filter((id) => !aliveIds.has(String(id)));

  const toClose = [...recovered.map((p) => p._id), ...orphaned];
  if (!toClose.length) return 0;

  const result = await Reorder.updateMany(
    { product: { $in: toClose }, status: "pending" },
    { $set: { status: "cancelled", note: "Closed automatically — stock is back above the threshold." } }
  );

  return result.modifiedCount || 0;
};

const remindLowStock = async () => {
  try {
    // Clear recovered items FIRST, so a product that dipped, was restocked and
    // has dipped again can raise a fresh reorder in this same pass.
    const closed = await closeRecoveredReorders();
    if (closed) console.log(`[reorder] closed ${closed} recovered reorder(s)`);

    const low = await Product.find({
      $expr: { $lte: ["$quantity", { $ifNull: ["$lowStockThreshold", DEFAULT_LOW_STOCK] }] },
    })
      .select("_id")
      .lean();
    for (const p of low) {
      await raiseReorderForProduct(p._id); // sequential — no burst of parallel sends
    }
    await sendLowStockDigest();
    if (low.length) console.log(`[reorder] low-stock sweep: ${low.length} product(s), digest checked`);
  } catch (error) {
    console.error("[reorder] sweep failed:", error.message);
  }
};

// ── Owner/admin views the queue ─────────────────────────────────────────────
module.exports.getReorders = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const reorders = await Reorder.find(filter).sort({ status: 1, createdAt: -1 }).limit(500);

    // Keep pending reorders' supplier in step with the product's CURRENT supplier.
    // A reorder snapshots the supplier when it's raised, but the shop often links
    // the supplier afterwards — refresh the snapshot here so the queue (and the
    // "Approve & send" email) reflect the link without having to re-raise it.
    const pendingReorders = reorders.filter((r) => r.status === "pending" && r.product);
    if (pendingReorders.length > 0) {
      const products = await Product.find({
        _id: { $in: pendingReorders.map((r) => r.product) },
      })
        .populate("supplier", "name contactInfo")
        .select("supplier")
        .lean();
      const supplierByProduct = new Map(products.map((p) => [String(p._id), p.supplier]));

      await Promise.all(
        pendingReorders.map(async (r) => {
          const supplier = supplierByProduct.get(String(r.product));
          const id = supplier?._id ? String(supplier._id) : "";
          const name = supplier?.name || "";
          const email = supplier?.contactInfo?.email || "";
          if (
            String(r.supplier || "") !== id ||
            (r.supplierName || "") !== name ||
            (r.supplierEmail || "") !== email
          ) {
            r.supplier = supplier?._id || null;
            r.supplierName = name;
            r.supplierEmail = email;
            await r.save();
          }
        })
      );
    }

    const pending = await Reorder.countDocuments({ status: "pending" });
    return res.status(200).json({ reorders, pending });
  } catch (error) {
    return res.status(500).json({ message: "Could not load reorders", error: error.message });
  }
};

// Adjust the quantity before approving.
module.exports.updateReorder = async (req, res) => {
  try {
    // A malformed id would otherwise throw a CastError and surface as a 500.
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid reorder id" });
    }
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
    // A malformed id would otherwise throw a CastError and surface as a 500.
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid reorder id" });
    }
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
    // A malformed id would otherwise throw a CastError and surface as a 500.
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid reorder id" });
    }
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
module.exports.remindLowStock = remindLowStock;
// Exported so the recovery rule can be exercised on its own.
module.exports.closeRecoveredReorders = closeRecoveredReorders;
