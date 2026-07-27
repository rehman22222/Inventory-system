/*
 * Resend the "review your purchase" email for orders that are already delivered
 * but whose review email never went out (e.g. the store SMTP was misconfigured
 * at delivery time). Safe to re-run: it skips any order that already has a
 * review, and reuses the order's existing review token/link.
 *
 *   node scripts/resendReviewEmails.js            # send for all delivered
 *   ONLY=WEB-14,WEB-15 node scripts/resendReviewEmails.js   # just these
 *   DRY_RUN=true ...                              # list, don't send
 *
 * Fix the STORE_SMTP_* credentials in .env FIRST — otherwise every send fails
 * with "authentication failed" and nothing is delivered.
 */
require("dotenv").config();
const crypto = require("crypto");
const mongoose = require("mongoose");
const { sendMail } = require("../libs/mailer");
const { reviewRequestEmail } = require("../controller/onlineStoreController");
const OnlineOrder = require("../models/OnlineOrdermodel");
const OnlineReview = require("../models/OnlineReviewmodel");
const OnlineStoreSetting = require("../models/OnlineStoreSettingmodel");

const DRY_RUN = process.env.DRY_RUN === "true";
const ONLY = (process.env.ONLY || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const base = () =>
  String(process.env.STOREFRONT_PUBLIC_URL || process.env.APP_URL || "").replace(
    /\/+$/,
    "",
  );

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL || process.env.MONGODB_URI);
    const filter = { status: "delivered" };
    if (ONLY.length) filter.orderNo = { $in: ONLY };
    const orders = await OnlineOrder.find(filter);
    console.log(`[resend] ${orders.length} delivered order(s) to consider (dry-run=${DRY_RUN})`);

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const order of orders) {
      if (!order.customer?.email) {
        skipped += 1;
        continue;
      }
      const already = await OnlineReview.countDocuments({ order: order._id });
      if (already > 0) {
        console.log(`  ↷ ${order.orderNo} — already has ${already} review(s), skipping`);
        skipped += 1;
        continue;
      }
      if (!order.reviewToken) {
        order.reviewToken = crypto.randomBytes(24).toString("hex");
        if (!DRY_RUN) await order.save();
      }
      const link = `${base()}/review/${encodeURIComponent(order.orderNo)}/${order.reviewToken}`;
      if (DRY_RUN) {
        console.log(`  ✓ ${order.orderNo} -> would send to ${order.customer.email} (${link})`);
        sent += 1;
        continue;
      }

      const settings = await OnlineStoreSetting.findOne({ store: order.store }).lean();
      const brand = {
        name:
          settings?.business?.tradingName ||
          settings?.business?.legalName ||
          "Online Store",
        addressLines: settings?.footer?.address ? [settings.footer.address] : [],
        phone: settings?.footer?.supportPhone || "",
      };
      const result = await sendMail({
        to: order.customer.email,
        subject: `How was your order? Leave a review · ${brand.name}`,
        html: reviewRequestEmail(order, link, brand, settings),
        fromName: brand.name,
        account: "store",
      });
      if (result.ok) {
        console.log(`  ✓ ${order.orderNo} -> sent to ${order.customer.email}`);
        order.reviewRequestedAt = new Date();
        await order.save();
        sent += 1;
      } else {
        console.warn(`  ✗ ${order.orderNo} -> NOT sent: ${result.error || result.reason}`);
        failed += 1;
      }
    }

    console.log("──────────────────────────────────────────────");
    console.log(`[resend] sent: ${sent}  skipped: ${skipped}  failed: ${failed}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("[resend] failed:", error.message);
    process.exit(1);
  }
})();
