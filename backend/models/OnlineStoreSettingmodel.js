const mongoose = require("mongoose");

// Starter legal copy. Deliberately generic and shop-editable from the admin
// "Online store → Settings" tab — it is a sensible default the owner adapts to
// their own trading terms, NOT legal advice. Headings use a leading "## " so the
// storefront can render them as section titles; blank lines separate paragraphs.
const POLICY_REVIEW_NOTE =
  "This is a starter template. Review and adapt it to your business, and have it checked by a qualified professional before relying on it.";

const DEFAULT_TERMS = `## Terms & Conditions

By using this website and placing an order you agree to these terms. Please read them carefully.

## Eligibility

This is an age-restricted store. You must be at least 18 years old to browse or buy. We may refuse or cancel any order where age cannot be verified.

## Orders & pricing

All orders are subject to acceptance and stock availability. Prices are shown in euro and include applicable taxes unless stated otherwise. We reserve the right to correct pricing errors before dispatch.

## Payment

Payment is taken as described at checkout. Where cash on delivery is offered, payment is due in full when your order arrives.

## Product information

Nicotine is an addictive substance. Our products are intended for adult smokers and vapers only. Product images are for illustration; always read the label before use.

## Liability

Nothing in these terms limits your statutory rights as a consumer.

${POLICY_REVIEW_NOTE}`;

const DEFAULT_PRIVACY = `## Privacy Policy

We respect your privacy and only collect the information we need to process your orders and run this store.

## What we collect

Contact and delivery details you provide at checkout (name, email, phone, address) and order history. We do not store card details on this site.

## How we use it

To fulfil and deliver your orders, provide support, and meet our legal obligations. We do not sell your personal data.

## Your rights

Under the GDPR you may request access to, correction of, or deletion of your personal data. Contact us using the details on our contact page to make a request.

## Retention

We keep order records for as long as required for accounting and legal purposes, then delete or anonymise them.

${POLICY_REVIEW_NOTE}`;

const DEFAULT_SHIPPING_RETURNS = `## Shipping & Returns

## Shipping

We aim to dispatch in-stock orders the same or next working day. Delivery times depend on your location and the carrier. Free shipping may apply over a set order value, as shown in the site banner.

## Returns

If something is wrong with your order, contact us within 14 days of delivery. Unopened, unused items in their original packaging may be returned in line with your statutory rights.

## Age-restricted items

For health and safety reasons we cannot accept returns of opened e-liquids, disposables, pods or coils unless they are faulty.

## Refunds

Approved refunds are issued to your original payment method once we receive and inspect the returned item.

${POLICY_REVIEW_NOTE}`;

const DEFAULT_REFUNDS = `## Refund Policy

We want you to be happy with your order. This policy explains when and how refunds are given, alongside your statutory rights.

## When you can get a refund

If your item arrives faulty, damaged or not as described, you are entitled to a repair, replacement or refund. Contact us within 14 days of delivery.

## Age-restricted items

For health and safety reasons we cannot refund opened e-liquids, disposables, pods or coils unless they are faulty.

## How to request a refund

Contact us with your order number and a short description (and a photo, if the item is damaged). We'll tell you the next steps.

## How your refund is paid

Approved refunds are issued to your original payment method once we have received and checked the returned item. Please allow a few working days for it to appear.

${POLICY_REVIEW_NOTE}`;

const DEFAULT_COOKIES = `## Cookie Policy

This website uses a small number of cookies and similar technologies to work correctly and to remember your choices.

## Essential cookies

Needed for the site to function — for example, keeping your basket and remembering that you have confirmed your age. These cannot be switched off.

## Preferences

Some cookies remember your settings to improve your experience on return visits.

## Managing cookies

You can control or delete cookies through your browser settings. Blocking essential cookies may stop parts of the site from working.

${POLICY_REVIEW_NOTE}`;

const OnlineStoreSettingSchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
      unique: true,
      index: true,
    },
    social: {
      instagram: { type: String, default: "", trim: true },
      facebook: { type: String, default: "", trim: true },
      twitter: { type: String, default: "", trim: true },
      tiktok: { type: String, default: "", trim: true },
    },
    footer: {
      description: {
        type: String,
        default:
          "Premium vape products, trusted flavours and reliable service from CliffsOfPuff.",
        trim: true,
      },
      supportEmail: { type: String, default: "", trim: true, lowercase: true },
      supportPhone: { type: String, default: "", trim: true },
      address: { type: String, default: "", trim: true },
    },
    announcement: {
      primary: {
        type: String,
        default: "Free shipping over €50 · Same-day dispatch",
        trim: true,
      },
      secondary: {
        type: String,
        default: "18+ only · Nicotine warning",
        trim: true,
      },
    },
    newThisWeek: {
      enabled: { type: Boolean, default: true },
      eyebrow: {
        type: String,
        default: "Fresh drops",
        trim: true,
        maxlength: 80,
      },
      title: {
        type: String,
        default: "New this week.",
        trim: true,
        maxlength: 120,
      },
      subtitle: {
        type: String,
        default:
          "The latest products to land in store, selected by the CliffsOfPuff team.",
        trim: true,
        maxlength: 300,
      },
      limit: { type: Number, default: 8, min: 4, max: 12 },
    },
    deals: {
      enabled: { type: Boolean, default: true },
      eyebrow: {
        type: String,
        default: "Live sale",
        trim: true,
        maxlength: 80,
      },
      title: {
        type: String,
        default: "Weekly deals.",
        trim: true,
        maxlength: 120,
      },
      subtitle: {
        type: String,
        default:
          "Limited-time online prices selected by the CliffsOfPuff team. Stock updates from the same inventory used at the till.",
        trim: true,
        maxlength: 300,
      },
      ctaLabel: {
        type: String,
        default: "See the deals",
        trim: true,
        maxlength: 40,
      },
      limit: { type: Number, default: 4, min: 2, max: 8 },
    },
    // Business identity shown in the storefront footer — required for EU
    // e-commerce transparency. All optional so a sole trader can leave the bits
    // that don't apply to them blank.
    business: {
      legalName: { type: String, default: "", trim: true, maxlength: 200 },
      tradingName: { type: String, default: "", trim: true, maxlength: 200 },
      companyNumber: { type: String, default: "", trim: true, maxlength: 60 },
      vatNumber: { type: String, default: "", trim: true, maxlength: 60 },
    },
    // Legal pages, editable by the shop. Rendered on /terms, /privacy,
    // /shipping-returns and /cookies and linked from the footer. Seeded with the
    // starter templates above; the owner edits them to match their business.
    policies: {
      terms: { type: String, default: DEFAULT_TERMS, trim: true, maxlength: 20000 },
      privacy: { type: String, default: DEFAULT_PRIVACY, trim: true, maxlength: 20000 },
      shippingReturns: {
        type: String,
        default: DEFAULT_SHIPPING_RETURNS,
        trim: true,
        maxlength: 20000,
      },
      refunds: { type: String, default: DEFAULT_REFUNDS, trim: true, maxlength: 20000 },
      cookies: { type: String, default: DEFAULT_COOKIES, trim: true, maxlength: 20000 },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("OnlineStoreSetting", OnlineStoreSettingSchema);
