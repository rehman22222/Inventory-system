import { createContext, useContext, type ReactNode } from "react";
import type { Category, Product, StorefrontSettings } from "./catalog";

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
    description: "Premium vape products, trusted flavours and reliable service from CliffsOfPuff.",
    supportEmail: "",
    supportPhone: "",
    address: "",
  },
  announcement: {
    primary: "Free shipping over {free} · {dispatch}",
    secondary: "18+ only · Nicotine warning",
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
  deals: {
    enabled: true,
    eyebrow: "Live sale",
    title: "Weekly deals.",
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

const CatalogContext = createContext<CatalogValue>({
  categories: [],
  products: [],
  settings: defaultStorefrontSettings,
});

export function CatalogProvider({ value, children }: { value: CatalogValue; children: ReactNode }) {
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export const useCatalog = () => useContext(CatalogContext);
