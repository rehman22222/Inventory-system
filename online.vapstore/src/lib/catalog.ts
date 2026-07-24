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
}

export interface Product {
  /** The listing's slug — also the /product/$id route param. */
  id: string;
  listingId: string;
  productId: string;
  name: string;
  brand: string;
  category: CategorySlug;
  categories: CategorySlug[];
  price: number;
  regularPrice?: number;
  compareAt?: number;
  sale?: boolean;
  saleEndsAt?: string;
  publishedAt?: string;
  image: string;
  gallery: { url: string; alt?: string }[];
  tags?: ("new" | "bestseller" | "sale" | "limited")[];
  short: string;
  description: string;
  specs: Record<string, string>;
  flavor?: string;
  optionLabel?: string;
  variants: {
    productId: string;
    label: string;
    price: number;
    stock: number;
    image?: string;
  }[];
  stock: number;
  featured?: boolean;
}

export interface StorefrontSettings {
  social: {
    instagram: string;
    facebook: string;
    twitter: string;
    tiktok: string;
  };
  footer: {
    description: string;
    supportEmail: string;
    supportPhone: string;
    address: string;
  };
  announcement: {
    primary: string;
    secondary: string;
  };
  newThisWeek: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    subtitle: string;
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
}

export interface HeroSlide {
  id: string;
  eyebrow: string;
  titleTop: string;
  titleItalic: string;
  titleBadge: string;
  titleBottom: string;
  copy: string;
  ctaPrimary: { label: string; to: string; params?: Record<string, string> };
  ctaSecondary: { label: string; to: string; params?: Record<string, string> };
  image: string;
  imageAlt: string;
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

export const saleProducts = (products: Product[]) => products.filter((p) => !!p.compareAt);

export const newArrivals = (products: Product[], limit = 8) =>
  (() => {
    const selected = products.filter((p) => p.tags?.includes("new"));
    const pool = selected.length
      ? selected
      : [...products].sort(
          (a, b) => (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0),
        );
    return pool.slice(0, limit);
  })();

export const bestSellers = (products: Product[], limit = 8) => {
  const flagged = products.filter((p) => p.tags?.includes("bestseller"));
  // Fall back to featured, then simply the first of the catalogue, so these
  // rails are never empty on a shop that hasn't tagged anything yet.
  const pool = flagged.length ? flagged : products.filter((p) => p.featured);
  return (pool.length ? pool : products).slice(0, limit);
};

export const brandsOf = (products: Product[]) =>
  [...new Set(products.map((p) => p.brand).filter(Boolean))].sort();
