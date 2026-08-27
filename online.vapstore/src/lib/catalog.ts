/* Types and pure helpers for the shop's catalogue.
 *
 * Deliberately contains NO fetching and NO environment access, so it is safe to
 * import from components that render in the browser. Everything that talks to
 * the E360 backend lives in catalog.server.ts, behind server functions.
 */

export type CategorySlug = string;

export interface Category {
  slug: CategorySlug;
  name: string;
  tagline: string;
  image: string;
  /** Slug of the parent category, or null for a top-level category. */
  parentSlug?: CategorySlug | null;
}

export interface Product {
  /** The listing's slug — also the /product/$id route param. */
  id: string;
  listingId: string;
  productId: string;
  name: string;
  familyLabel?: string;
  familyImage?: string;
  catalogImage?: string;
  selfVariantLabel?: string;
  brand: string;
  category: CategorySlug;
  categories: CategorySlug[];
  price: number;
  regularPrice?: number;
  compareAt?: number;
  sale?: boolean;
  saleEndsAt?: string;
  /** Quantity deal: pay `price` each once you buy `minQty` or more. */
  qtyDeal?: {
    minQty: number;
    price: number;
    regularPrice: number;
    image?: string;
  } | null;
  /** Promo image for the live deal (base sale or quantity deal), if uploaded. */
  dealImage?: string;
  publishedAt?: string;
  image: string;
  gallery: { url: string; alt?: string }[];
  tags?: ("new" | "bestseller" | "sale" | "limited" | "hot")[];
  short: string;
  description: string;
  specs: Record<string, string>;
  flavor?: string;
  optionLabel?: string;
  variantLabel?: string;
  variants: {
    productId: string;
    label: string;
    kind?: "flavour" | "colour" | "option";
    price: number;
    stock: number;
    image?: string;
  }[];
  linkedListings?: Product[];
  stock: number;
  featured?: boolean;
  /** Verified-purchase review summary. `count` 0 when nobody has reviewed yet. */
  rating?: { average: number; count: number };
}

export interface Review {
  id: string;
  name: string;
  rating: number;
  title: string;
  body: string;
  verified: boolean;
  createdAt: string;
}

export interface ReviewSummary {
  average: number;
  count: number;
  breakdown: Record<string, number>;
}

export interface StorefrontSettings {
  social: {
    instagram: string;
    facebook: string;
    twitter: string;
    tiktok: string;
  };
  footer: {
    newsletterHeading: string;
    description: string;
    supportEmail: string;
    supportPhone: string;
    address: string;
    openingHours: string;
    paymentImage: string;
    restrictionImage: string;
    whyECigarettesTitle: string;
    whyECigarettesContent: string;
  };
  footerLinks: Record<
    | "contact"
    | "terms"
    | "privacy"
    | "refunds"
    | "about"
    | "bestSellers"
    | "whyECigarettes"
    | "deals"
    | "blog",
    { enabled: boolean; label: string; href: string }
  >;
  announcement: {
    enabled: boolean;
    primary: string;
    secondary: string;
  };
  events?: {
    enabled: boolean;
    heading: string;
    align: "left" | "center" | "right";
    items?: {
      enabled?: boolean;
      kind: "product" | "category";
      targetId: string;
      tag?: string;
      eventPrice?: number | null;
    }[];
  };
  emergencyAlert: {
    active: boolean;
    title: string;
    message: string;
    buttonLabel: string;
    tone: "maintenance" | "warning" | "info";
  };
  /** Checkout shipping, set by the shop owner in admin. */
  shipping: {
    flatRate: number;
    freeThreshold: number;
  };
  /** Trust badges on the product page, set by the shop owner in admin. */
  promises: {
    dispatch: string;
    returnsDays: number;
    authentic: boolean;
    authenticLabel: string;
  };
  newThisWeek: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    subtitle: string;
    limit: number;
  };
  bestSellers?: {
    enabled: boolean;
    limit: number;
  };
  deals: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    subtitle: string;
    ctaLabel: string;
    limit: number;
  };
  blog: {
    eyebrow: string;
    heading: string;
    intro: string;
    featuredHeading: string;
    latestHeading: string;
    seoTitle: string;
    seoDescription: string;
  };
  business: {
    legalName: string;
    tradingName: string;
    companyNumber: string;
    vatNumber: string;
  };
  policies: {
    terms: string;
    privacy: string;
    shippingReturns: string;
    refunds: string;
    cookies: string;
    about: string;
  };
}

/* Announcement/marketing copy can use placeholders that always reflect the
 * current settings, so changing the shipping threshold (or dispatch text) in
 * admin updates every banner at once — no need to re-edit the wording:
 *   {free}     → the free-shipping amount, e.g. "€100"
 *   {dispatch} → the dispatch label, e.g. "Fast dispatch" */
export const fillTokens = (text: string, settings: StorefrontSettings): string =>
  String(text || "")
    .replace(/\{free\}/gi, `€${settings.shipping.freeThreshold}`)
    .replace(/\{dispatch\}/gi, settings.promises.dispatch);

/* Availability shown to shoppers is deliberately coarse. Exposing an exact
 * "1 in stock" both looks broken on a shop that restocks constantly and invites
 * the frustration of a basket item selling out mid-checkout. Below the low-stock
 * threshold we nudge with urgency without publishing the precise figure. */
export const LOW_STOCK_THRESHOLD = 5;

export type Availability = { label: string; tone: "in" | "low" | "out" };

export const availabilityOf = (stock: number): Availability => {
  if (stock <= 0) return { label: "Out of stock", tone: "out" };
  if (stock <= LOW_STOCK_THRESHOLD) return { label: "Limited stock", tone: "low" };
  return { label: "In stock", tone: "in" };
};

export interface HeroSlide {
  id: string;
  linkType?: "none" | "product" | "products" | "category";
  linked?: boolean;
  eyebrow: string;
  titleTop: string;
  titleItalic: string;
  titleBadge: string;
  titleBottom: string;
  copy: string;
  ctaPrimary: {
    label: string;
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string>;
  } | null;
  ctaSecondary: { label: string; to: string; params?: Record<string, string> };
  image: string;
  mobileImage?: string;
  imageAlt: string;
  ctaPosition?: "bottom-left" | "bottom-center" | "bottom-right";
  burst: { top: string; big: string; bottom: string };
  tone: "cream" | "ink" | "accent";
  product: {
    slug: string;
    name: string;
    brand: string;
    price: number;
    was: number | null;
    stock: number;
  } | null;
}

/* ── Derived views. The curated catalogue is small, so these run over the list
 *    already loaded rather than costing another request. ─────────────────── */

export const productsByCategory = (products: Product[], slug: CategorySlug) =>
  products.filter((p) => p.category === slug || p.categories.includes(slug));

/* ── Category hierarchy. `parentSlug` is set by the backend; a category with no
 *    parent (or one that points at a missing/hidden parent) is top-level. ──── */

export const topLevelCategories = (categories: Category[]) => {
  const known = new Set(categories.map((c) => c.slug));
  return categories.filter((c) => !c.parentSlug || !known.has(c.parentSlug));
};

export const childCategories = (categories: Category[], parentSlug: CategorySlug) =>
  categories.filter((c) => c.parentSlug === parentSlug);

// Deals configured in Admin -> Online Store are authoritative. Ordinary live
// sales arrive as `sale`; Buy N+ offers arrive as `qtyDeal`. A manual
// compare-at price alone is presentation metadata and must not displace an
// active configured deal from the weekly-deals rail.
export const saleProducts = (products: Product[]) =>
  products.filter((product) => product.sale || Boolean(product.qtyDeal));

/**
 * The deepest discount on offer, as a whole percent — the number behind every
 * "UP TO -X% OFF" headline.
 *
 * It runs over the full sale list on purpose. Both the home deals block and the
 * sale page make the same claim, so they have to count the same products; when
 * the home rail was capped at its display limit the two pages advertised
 * different percentages off the same catalogue. A configured Buy N+ price wins
 * over the plain compare-at, matching what the cards themselves show.
 */
export const maxSalePercent = (products: Product[]) =>
  saleProducts(products).reduce((highest, product) => {
    const dealPrice = Number(product.qtyDeal?.price ?? product.price);
    const regular = Number(
      product.qtyDeal?.regularPrice || product.regularPrice || product.compareAt || 0,
    );
    if (regular <= 0 || dealPrice >= regular) return highest;
    return Math.max(highest, Math.round(((regular - dealPrice) / regular) * 100));
  }, 0);

export const newArrivals = (products: Product[], limit = 8) =>
  // Fully admin-curated: publishing a product does not put it in this rail.
  // Only products explicitly added through Admin -> Online Store are shown.
  products.filter((product) => product.tags?.includes("new")).slice(0, limit);

export const bestSellers = (products: Product[], limit = 8) => {
  const flagged = products.filter((p) => p.tags?.includes("bestseller"));
  return flagged.slice(0, limit);
};

/** Normalised key for a brand — what decides whether two spellings are one brand. */
export const brandKey = (brand?: string) => (brand || "").trim().toUpperCase();

/**
 * The brands present in a set of products, one chip each.
 *
 * Two things this has to get right, both of which it used to get wrong:
 *
 * Deduplication is case-insensitive. A brand entered as "LOOM" on one listing
 * and "Loom" on another is one brand, and the chips render uppercase — so
 * keeping both put the same name on screen twice with no way to tell them apart.
 *
 * Sorting goes through localeCompare. The default sort compares UTF-16 code
 * units, which places every capital before every lowercase letter: "ELUX" landed
 * before "Elf Bar", "PIXL" before "Pablo", "VELO" before "Vaporesso". Uppercased
 * for display, that reads as no order at all.
 */
export const brandsOf = (products: Product[]) => {
  const byKey = new Map<string, string>();

  for (const product of products) {
    const brand = (product.brand || "").trim();
    if (!brand) continue;

    // First spelling seen wins the label; the key is what matches.
    const key = brandKey(brand);
    if (!byKey.has(key)) byKey.set(key, brand);
  }

  return [...byKey.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
};
