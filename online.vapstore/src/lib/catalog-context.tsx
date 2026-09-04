import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Category, Product, StorefrontSettings } from "./catalog";
import { getStorefront } from "./catalog-api";

/* The shell's copy of the catalogue.
 *
 * The root loader fetches categories and the listed products once per render;
 * the header (its category nav and mega menu), the footer and the category
 * tiles all read from here instead of each firing their own request. The
 * curated catalogue is small by design, so holding it is cheaper than the
 * round trips would be. */

interface CatalogValue {
  categories: Category[];
  products: Product[];
  settings: StorefrontSettings;
}

export const defaultStorefrontSettings: StorefrontSettings = {
  social: { instagram: "", facebook: "", twitter: "", tiktok: "" },
  footer: {
    newsletterHeading: "Subscribe to our newsletters",
    description: "Premium vape products, trusted flavours and reliable service from Cliffs of Puff.",
    supportEmail: "",
    supportPhone: "",
    address: "",
    openingHours: "Mon-Sat 9am - 4pm",
    paymentImage: "/payment-logo2.webp",
    restrictionImage: "/not.webp",
    whyECigarettesTitle: "Why e-cigarettes?",
    whyECigarettesContent:
      "E-cigarettes give adult smokers an alternative to combustible cigarettes. Cliffs of Puff stocks age-restricted, authentic products only.",
  },
  footerLinks: {
    contact: { enabled: true, label: "Contact us", href: "/contact" },
    terms: { enabled: true, label: "Terms and Conditions", href: "/terms" },
    privacy: { enabled: true, label: "Privacy Policy", href: "/privacy" },
    refunds: { enabled: true, label: "Return & Refund", href: "/refunds" },
    about: { enabled: true, label: "About Us", href: "/about" },
    bestSellers: { enabled: true, label: "Best Sellers", href: "/#best-sellers" },
    whyECigarettes: { enabled: true, label: "Why e-cigarettes?", href: "/why-e-cigarettes" },
    deals: { enabled: true, label: "Deals", href: "/sale" },
    blog: { enabled: true, label: "Blog", href: "/blog" },
  },
  announcement: {
    enabled: true,
    primary: "Free shipping over {free} · {dispatch}",
    secondary: "18+ only · Nicotine warning",
  },
  events: {
    enabled: false,
    heading: "",
    align: "center",
    items: [],
  },
  emergencyAlert: {
    active: false,
    title: "Website under maintenance",
    message: "We are making a few improvements. Please check back shortly.",
    buttonLabel: "Come back soon",
    tone: "maintenance",
  },
  shipping: { flatRate: 4.99, freeThreshold: 100 },
  checkout: {
    deliveryNote: "Delivery is free within a 5 mile radius.",
    orderTerms: [
      "18+ only. Valid ID may be required.",
      "7-day returns with receipt; unused & unopened items only.",
      "Statutory consumer rights remain unaffected.",
    ].join("\n"),
  },
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
    subtitle: "The latest products to land in store, selected by the Cliffs of Puff team.",
    limit: 8,
  },
  bestSellers: {
    enabled: true,
    limit: 8,
  },
  deals: {
    enabled: true,
    eyebrow: "Live sale",
    title: "Don’t Miss Out.",
    subtitle:
      "Limited-time online prices selected by the Cliffs of Puff team. Stock updates from the same inventory used at the till.",
    ctaLabel: "See the deals",
    limit: 4,
  },
  blog: {
    eyebrow: "Journal",
    heading: "Stories, guides & updates.",
    intro: "Product guides, store news and useful information from Cliffs of Puff.",
    featuredHeading: "Featured article",
    latestHeading: "Latest articles",
    seoTitle: "Blog",
    seoDescription: "News, guides and product stories from Cliffs of Puff.",
  },
  business: { legalName: "", tradingName: "", companyNumber: "", vatNumber: "" },
  policies: {
    terms: "",
    privacy: "",
    shippingReturns: "",
    refunds: "",
    cookies: "",
    about: "",
  },
};

const CatalogContext = createContext<CatalogValue>({
  categories: [],
  products: [],
  settings: defaultStorefrontSettings,
});

export function CatalogProvider({ value, children }: { value: CatalogValue; children: ReactNode }) {
  const [catalog, setCatalog] = useState(value);

  useEffect(() => setCatalog(value), [value]);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const next = await getStorefront();
        if (cancelled) return;
        // The server helper deliberately falls back to an empty catalogue
        // during a backend outage. Keep the last healthy screen in that case
        // instead of making every product disappear for an open shopper.
        setCatalog((current) =>
          current.products.length > 0 && next.products.length === 0 ? current : next,
        );
      } catch {
        // Keep the last healthy catalogue. The server records the real error.
      }
    };

    // Admin merchandising changes become visible to already-open storefronts
    // without exposing the private inventory API or weakening socket auth.
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>;
}

export const useCatalog = () => useContext(CatalogContext);
