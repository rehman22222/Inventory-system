import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Category, HeroSlide, Product, StorefrontSettings } from "./catalog";

const defaultStorefrontSettings: StorefrontSettings = {
  social: { instagram: "", facebook: "", twitter: "", tiktok: "" },
  footer: {
    description:
      "Premium vape products, trusted flavours and reliable service from Candy Cloud Vape.",
    supportEmail: "",
    supportPhone: "",
    address: "",
  },
  announcement: {
    primary: "Free shipping over €50 · Same-day dispatch",
    secondary: "21+ only · Nicotine warning",
  },
  newThisWeek: {
    enabled: true,
    eyebrow: "Fresh drops",
    title: "New this week.",
    subtitle: "The latest products to land in store, selected by the Candy Cloud team.",
    limit: 8,
  },
  deals: {
    enabled: true,
    eyebrow: "Live sale",
    title: "Weekly deals.",
    subtitle:
      "Limited-time online prices selected by the Candy Cloud team. Stock updates from the same inventory used at the till.",
    ctaLabel: "See the deals",
    limit: 4,
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

async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${API()}/api/storefront${path}`, {
      headers: KEY() ? { "x-storefront-key": KEY() } : {},
    });
    if (!res.ok) {
      console.error(`[catalog] ${path} -> ${res.status}`);
      return fallback;
    }
    return (await res.json()) as T;
  } catch (error) {
    // A shop that cannot reach its backend should still render a page rather
    // than a 500 — an empty shelf is recoverable, a broken site is not.
    console.error(`[catalog] ${path} failed:`, (error as Error).message);
    return fallback;
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
  publishedAt: string | null;
  stock: number;
  featured: boolean;
};

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
  publishedAt: p.publishedAt ?? undefined,
  image: p.image,
  gallery: p.gallery || [],
  tags: p.tags || [],
  short: p.short || "",
  description: p.description || "",
  specs: p.specs || {},
  flavor: p.flavour || undefined,
  optionLabel: p.optionLabel || undefined,
  variants: p.variants || [],
  stock: p.stock,
  featured: p.featured,
});

const loadCategories = async (): Promise<Category[]> => {
  const data = await get<{
    categories: { slug: string; name: string; description: string; image: string }[];
  }>("/categories", { categories: [] });
  return data.categories.map((c) => ({
    slug: c.slug,
    name: c.name,
    tagline: c.description || "",
    image: c.image || "",
  }));
};

const loadProducts = async (categorySlug?: string): Promise<Product[]> => {
  const qs = categorySlug ? `?category=${encodeURIComponent(categorySlug)}` : "";
  const data = await get<{ products: ApiProduct[] }>(`/products${qs}`, { products: [] });
  return data.products.map(toProduct);
};

const loadSettings = async (): Promise<StorefrontSettings> => {
  const data = await get<{ settings: StorefrontSettings }>("/settings", {
    settings: defaultStorefrontSettings,
  });
  return {
    social: { ...defaultStorefrontSettings.social, ...(data.settings?.social || {}) },
    footer: { ...defaultStorefrontSettings.footer, ...(data.settings?.footer || {}) },
    announcement: {
      ...defaultStorefrontSettings.announcement,
      ...(data.settings?.announcement || {}),
    },
    newThisWeek: {
      ...defaultStorefrontSettings.newThisWeek,
      ...(data.settings?.newThisWeek || {}),
    },
    deals: {
      ...defaultStorefrontSettings.deals,
      ...(data.settings?.deals || {}),
    },
  };
};

/* ── Server functions the routes call ─────────────────────────────────────── */

/** Everything the shell needs on every page, in one round trip. */
export const getStorefront = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    categories: Category[];
    products: Product[];
    settings: StorefrontSettings;
  }> => {
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
  return data.slides;
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

/** Used by the sitemap server route, which already runs on the server. */
export const storefrontForSitemap = async () => {
  const [categories, products] = await Promise.all([loadCategories(), loadProducts()]);
  return { categories, products };
};
