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
