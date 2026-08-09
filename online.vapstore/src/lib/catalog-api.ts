import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type {
  Category,
  HeroSlide,
  Product,
  Review,
  ReviewSummary,
  StorefrontSettings,
} from "./catalog";
import { cldAuto, cldProductImage } from "./img";

const defaultStorefrontSettings: StorefrontSettings = {
  social: { instagram: "", facebook: "", twitter: "", tiktok: "" },
  footer: {
    newsletterHeading: "Subscribe to our newsletters",
    description: "Premium vape products, trusted flavours and reliable service from CliffsOfPuff.",
    supportEmail: "",
    supportPhone: "",
    address: "",
  },
  announcement: {
    enabled: true,
    primary: "Free shipping over {free} · {dispatch}",
    secondary: "18+ only · Nicotine warning",
  },
  emergencyAlert: {
    active: false,
    title: "Website under maintenance",
    message: "We are making a few improvements. Please check back shortly.",
    buttonLabel: "Come back soon",
    tone: "maintenance",
  },
  shipping: { flatRate: 4.99, freeThreshold: 100 },
  promises: {
    dispatch: "Fast dispatch",
    returnsDays: 14,
    authentic: true,
    authenticLabel: "100% authentic",
  },
  newThisWeek: {
    enabled: true,
    eyebrow: "Fresh drops",
    title: "New this week.",
    subtitle: "The latest products to land in store, selected by the CliffsOfPuff team.",
    limit: 8,
  },
  bestSellers: {
    enabled: true,
    limit: 8,
  },
  deals: {
    enabled: true,
    eyebrow: "Live sale",
    title: "Don’t miss out.",
    subtitle:
      "Limited-time online prices selected by the CliffsOfPuff team. Stock updates from the same inventory used at the till.",
    ctaLabel: "See the deals",
    limit: 4,
  },
  business: { legalName: "", tradingName: "", companyNumber: "", vatNumber: "" },
  policies: {
    terms: "",
    privacy: "",
    shippingReturns: "",
    refunds: "",
    cookies: "",
  },
};

/* SERVER ONLY.
 *
 * Everything that talks to the E360 backend lives behind `createServerFn`, so
 * the bundler strips it from the browser build and the client gets an RPC call
 * instead. That matters for two reasons:
 *
 *   1. STOREFRONT_API_KEY never reaches a shopper's browser.
 *   2. Route loaders also run on the CLIENT during in-app navigation. Without
 *      this boundary those navigations would try to hit the inventory API
 *      straight from the browser — cross-origin, unauthenticated, and exposing
 *      an internal service to the public.
 */

const API = () => (process.env.E360_API_URL || "http://localhost:3003").replace(/\/+$/, "");
const KEY = () => process.env.STOREFRONT_API_KEY || "";

// Hard cap on how long SSR will wait for the backend. Without it, a cold or
// slow backend makes the whole page hang until the platform kills it (which the
// visitor sees as a connection timeout). With it, we fall back to a rendered
// page in a few seconds instead of hanging.
const BACKEND_TIMEOUT_MS = 8000;
const CATALOG_CACHE_MS = 15_000;
const responseCache = new Map<
  string,
  { expiresAt: number; value?: unknown; pending?: Promise<unknown> }
>();

async function get<T>(path: string, fallback: T): Promise<T> {
  const now = Date.now();
  const cached = responseCache.get(path);
  if (cached?.value !== undefined && cached.expiresAt > now) {
    return cached.value as T;
  }
  if (cached?.pending) return cached.pending as Promise<T>;

  const request = fetchBackend<T>(path, fallback);
  responseCache.set(path, {
    expiresAt: now + CATALOG_CACHE_MS,
    value: cached?.value,
    pending: request,
  });
  try {
    const value = await request;
    responseCache.set(path, {
      expiresAt: Date.now() + CATALOG_CACHE_MS,
      value,
    });
    return value;
  } catch (error) {
    responseCache.delete(path);
    throw error;
  }
}

async function fetchBackend<T>(path: string, fallback: T): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);
  try {
    const res = await fetch(`${API()}/api/storefront${path}`, {
      headers: KEY() ? { "x-storefront-key": KEY() } : {},
      // Homepage merchandising is controlled from E360. Never reuse an old
      // catalogue/settings response after an admin adds, edits or removes a
      // "New this week" product.
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[catalog] ${path} -> ${res.status}`);
      return fallback;
    }
    return (await res.json()) as T;
  } catch (error) {
    // A shop that cannot reach its backend (down, cold, or too slow) should
    // still render a page rather than a 500 — an empty shelf is recoverable, a
    // hung/broken site is not.
    console.error(`[catalog] ${path} failed:`, (error as Error).message);
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API()}/api/storefront${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(KEY() ? { "x-storefront-key": KEY() } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => ({}))) as {
    message?: string;
  };
  if (!res.ok) {
    throw new Error(payload.message || `Checkout failed (${res.status})`);
  }
  return payload as T;
}

/* The API hands back a listing joined to its product; map it onto the shape the
 * components already speak. */
type ApiProduct = {
  id: string;
  productId: string;
  slug: string;
  name: string;
  brand: string;
  category: { id: string; slug: string; name: string } | null;
  categories: { id: string; slug: string; name: string }[];
  short: string;
  description: string;
  image: string;
  gallery: { url: string; alt?: string }[];
  specs: Record<string, string>;
  flavour: string;
  optionLabel: string;
  variants: {
    productId: string;
    label: string;
    kind?: "flavour" | "colour" | "option";
    price: number;
    stock: number;
    image?: string;
  }[];
  tags: Product["tags"];
  price: number;
  regularPrice: number;
  compareAt: number | null;
  sale: boolean;
  saleEndsAt: string | null;
  qtyDeal?: {
    minQty: number;
    price: number;
    regularPrice: number;
    image?: string;
  } | null;
  dealImage?: string;
  publishedAt: string | null;
  stock: number;
  featured: boolean;
  rating?: { average: number; count: number };
};

type ApiCategory = {
  slug: string;
  name: string;
  description: string;
  image: string;
  parent?: string | null;
};

type StorefrontCatalogPayload = {
  categories: ApiCategory[];
  products: ApiProduct[];
  settings: StorefrontSettings;
};

const toCategory = (c: ApiCategory): Category => ({
  slug: c.slug,
  name: c.name,
  tagline: c.description || "",
  image: cldAuto(c.image || ""),
  parentSlug: c.parent || null,
});

const toProduct = (p: ApiProduct): Product => ({
  id: p.slug,
  listingId: p.id,
  productId: p.productId,
  name: p.name,
  brand: p.brand || "",
  category: p.category?.slug || "",
  categories: (p.categories || []).map((category) => category.slug),
  price: p.price,
  regularPrice: p.regularPrice,
  compareAt: p.compareAt ?? undefined,
  sale: p.sale,
  saleEndsAt: p.saleEndsAt ?? undefined,
  qtyDeal: p.qtyDeal
    ? { ...p.qtyDeal, image: p.qtyDeal.image ? cldProductImage(p.qtyDeal.image) : "" }
    : null,
  dealImage: p.dealImage ? cldProductImage(p.dealImage) : "",
  publishedAt: p.publishedAt ?? undefined,
  image: cldProductImage(p.image),
  gallery: (p.gallery || []).map((image) => ({ ...image, url: cldProductImage(image.url) })),
  tags: p.tags || [],
  short: p.short || "",
  description: p.description || "",
  specs: p.specs || {},
  flavor: p.flavour || undefined,
  optionLabel: p.optionLabel || undefined,
  variants: (p.variants || []).map((variant) => ({
    ...variant,
    image: variant.image ? cldProductImage(variant.image) : variant.image,
  })),
  stock: p.stock,
  featured: p.featured,
  rating: p.rating || { average: 0, count: 0 },
});

const loadCategories = async (): Promise<Category[]> => {
  const data = await get<{
    categories: ApiCategory[];
  }>("/categories", { categories: [] });
  return data.categories.map(toCategory);
};

const loadProducts = async (categorySlug?: string): Promise<Product[]> => {
  const qs = categorySlug
    ? `?category=${encodeURIComponent(categorySlug)}&view=card`
    : "?view=card";
  const data = await get<{ products: ApiProduct[] }>(`/products${qs}`, { products: [] });
  return data.products.map(toProduct);
};

const mergeSettings = (settings?: StorefrontSettings): StorefrontSettings => {
  return {
    social: { ...defaultStorefrontSettings.social, ...(settings?.social || {}) },
    footer: { ...defaultStorefrontSettings.footer, ...(settings?.footer || {}) },
    announcement: {
      ...defaultStorefrontSettings.announcement,
      ...(settings?.announcement || {}),
    },
    emergencyAlert: {
      ...defaultStorefrontSettings.emergencyAlert,
      ...(settings?.emergencyAlert || {}),
    },
    shipping: {
      ...defaultStorefrontSettings.shipping,
      ...(settings?.shipping || {}),
    },
    promises: {
      ...defaultStorefrontSettings.promises,
      ...(settings?.promises || {}),
    },
    newThisWeek: {
      ...defaultStorefrontSettings.newThisWeek,
      ...(settings?.newThisWeek || {}),
    },
    bestSellers: {
      ...defaultStorefrontSettings.bestSellers,
      ...(settings?.bestSellers || {}),
    },
    deals: {
      ...defaultStorefrontSettings.deals,
      ...(settings?.deals || {}),
    },
    business: {
      ...defaultStorefrontSettings.business,
      ...(settings?.business || {}),
    },
    policies: {
      ...defaultStorefrontSettings.policies,
      ...(settings?.policies || {}),
    },
  };
};

const loadSettings = async (): Promise<StorefrontSettings> => {
  const data = await get<{ settings: StorefrontSettings }>("/settings", {
    settings: defaultStorefrontSettings,
  });
  return mergeSettings(data.settings);
};

/* ── Server functions the routes call ─────────────────────────────────────── */

/** Everything the shell needs on every page, in one round trip. */
export const getStorefront = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    categories: Category[];
    products: Product[];
    settings: StorefrontSettings;
  }> => {
    const catalog = await get<StorefrontCatalogPayload | null>("/catalog", null);
    if (catalog) {
      return {
        categories: (catalog.categories || []).map(toCategory),
        products: (catalog.products || []).map(toProduct),
        settings: mergeSettings(catalog.settings),
      };
    }

    const [categories, products, settings] = await Promise.all([
      loadCategories(),
      loadProducts(),
      loadSettings(),
    ]);
    return { categories, products, settings };
  },
);

export const getHero = createServerFn({ method: "GET" }).handler(async (): Promise<HeroSlide[]> => {
  const data = await get<{ slides: HeroSlide[] }>("/hero", { slides: [] });
  return data.slides.map((slide) => ({
    ...slide,
    image: cldAuto(slide.image),
    mobileImage: slide.mobileImage ? cldAuto(slide.mobileImage) : "",
  }));
});

export const getCategoryPage = createServerFn({ method: "GET" })
  .validator((slug: string) => String(slug))
  .handler(async ({ data: slug }): Promise<{ category: Category | null; products: Product[] }> => {
    const [categories, products] = await Promise.all([loadCategories(), loadProducts(slug)]);
    return { category: categories.find((c) => c.slug === slug) ?? null, products };
  });

export const getProductPage = createServerFn({ method: "GET" })
  .validator((slug: string) => String(slug))
  .handler(async ({ data: slug }): Promise<{ product: Product | null; related: Product[] }> => {
    const one = await get<{ product: ApiProduct | null }>(`/products/${encodeURIComponent(slug)}`, {
      product: null,
    });
    if (!one.product) return { product: null, related: [] };
    const product = toProduct(one.product);
    const sameCategory = await loadProducts(product.category);
    return { product, related: sameCategory.filter((r) => r.id !== product.id).slice(0, 4) };
  });

const checkoutSchema = z.object({
  clientRef: z.string().min(8).max(100),
  items: z
    .array(
      z.object({
        listing: z.string().min(1).max(100),
        product: z.string().min(1).max(100),
        quantity: z.number().int().min(1).max(100),
      }),
    )
    .min(1)
    .max(50),
  customer: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(200),
    phone: z.string().trim().max(40).default(""),
  }),
  shippingAddress: z.object({
    line1: z.string().trim().min(3).max(200),
    line2: z.string().trim().max(200).default(""),
    city: z.string().trim().min(2).max(100),
    region: z.string().trim().max(100).default(""),
    postcode: z.string().trim().min(2).max(30),
    country: z.string().trim().min(2).max(100),
  }),
  note: z.string().trim().max(500).default(""),
  voucherCode: z.string().trim().max(40).optional().default(""),
  paymentMethod: z.literal("cash_on_delivery"),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const placeStorefrontOrder = createServerFn({ method: "POST" })
  .validator((input: CheckoutInput) => checkoutSchema.parse(input))
  .handler(
    async ({
      data,
    }): Promise<{
      message: string;
      order: { orderNo: string; total: number; status: string };
      idempotent?: boolean;
    }> => post("/orders", data),
  );

const voucherSchema = z.object({
  code: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(200).optional().or(z.literal("")),
  items: checkoutSchema.shape.items,
});

export type VoucherInput = z.infer<typeof voucherSchema>;

export const validateStorefrontVoucher = createServerFn({ method: "POST" })
  .validator((input: VoucherInput) => voucherSchema.parse(input))
  .handler(
    async ({
      data,
    }): Promise<{
      valid: true;
      voucher: { code: string; name: string; discountType: string; value: number };
      eligibleSubtotal: number;
      discount: number;
      message: string;
    }> => post("/vouchers/validate", data),
  );

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().max(150).default(""),
  message: z.string().trim().min(5).max(4000),
  // Honeypot: must stay empty. Real users never see this field.
  website: z.string().max(0).optional().default(""),
});

export type ContactInput = z.infer<typeof contactSchema>;

export const submitContactMessage = createServerFn({ method: "POST" })
  .validator((input: ContactInput) => contactSchema.parse(input))
  .handler(async ({ data }): Promise<{ message: string }> => post("/contact", data));

const newsletterSchema = z.object({
  email: z.string().trim().email().max(200),
});

export type NewsletterInput = z.infer<typeof newsletterSchema>;

export const subscribeNewsletter = createServerFn({ method: "POST" })
  .validator((input: NewsletterInput) => newsletterSchema.parse(input))
  .handler(async ({ data }): Promise<{ message: string }> => post("/newsletter", data));

/* ── Reviews ───────────────────────────────────────────────────────────────*/

export const getProductReviews = createServerFn({ method: "GET" })
  .validator((slug: string) => String(slug))
  .handler(
    async ({
      data: slug,
    }): Promise<{ reviews: Review[]; summary: ReviewSummary }> =>
      get(`/products/${encodeURIComponent(slug)}/reviews`, {
        reviews: [],
        summary: { average: 0, count: 0, breakdown: {} },
      }),
  );

const reviewContextSchema = z.object({
  order: z.string().trim().min(1).max(60),
  token: z.string().trim().min(1).max(128),
});
export type ReviewContextInput = z.infer<typeof reviewContextSchema>;

export interface ReviewContext {
  /** ok = items to review; done = all reviewed; invalid = bad link; not_delivered = too early. */
  state: "ok" | "done" | "invalid" | "not_delivered";
  customerName: string;
  orderNo: string;
  items: { productId: string; listingId: string; slug: string; name: string; image: string }[];
}

export const getReviewContext = createServerFn({ method: "GET" })
  .validator((input: ReviewContextInput) => reviewContextSchema.parse(input))
  .handler(async ({ data }): Promise<ReviewContext> => {
    const qs = `?order=${encodeURIComponent(data.order)}&token=${encodeURIComponent(data.token)}`;
    return get<ReviewContext>(`/reviews/context${qs}`, {
      state: "invalid",
      customerName: "",
      orderNo: data.order,
      items: [],
    });
  });

const submitReviewSchema = z.object({
  order: z.string().trim().min(1).max(60),
  token: z.string().trim().min(1).max(128),
  productId: z.string().trim().min(1).max(60),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).default(""),
  body: z.string().trim().max(2000).default(""),
});
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

export const submitReview = createServerFn({ method: "POST" })
  .validator((input: SubmitReviewInput) => submitReviewSchema.parse(input))
  .handler(async ({ data }): Promise<{ message: string; id: string }> =>
    post("/reviews", data),
  );

/** Used by the sitemap server route, which already runs on the server. */
export const storefrontForSitemap = async () => {
  const [categories, products] = await Promise.all([loadCategories(), loadProducts()]);
  return { categories, products };
};
