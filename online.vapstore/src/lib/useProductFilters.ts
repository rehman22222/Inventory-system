import { useMemo, useState } from "react";
import type { Product } from "./catalog";

/* Shared product filtering for the Shop and Category pages.
 *
 * Everything runs over the catalogue already in memory, so filtering is instant
 * and needs no extra request. A page that is already scoped to one category
 * passes `lockedCategory` so the category control is hidden and that scope is
 * always applied. */

export type Sort = "featured" | "price-asc" | "price-desc" | "new";

type VariantKind = "flavour" | "colour" | "option";
const KIND_TITLE: Record<VariantKind, string> = {
  flavour: "Flavours",
  colour: "Colours",
  option: "Options",
};

// Every price a product can be sold at (its variants', or the base price).
const productPrices = (p: Product): number[] => {
  const vs = p.variants.map((v) => v.price).filter((v) => v > 0);
  if (vs.length) return vs;
  return p.price > 0 ? [p.price] : [];
};

export function useProductFilters(products: Product[], lockedCategory?: string) {
  const [category, setCategory] = useState<string>("all");
  const [brand, setBrand] = useState<string>("all");
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [inStockOnly, setInStockOnly] = useState(false);
  // Selected attribute values, keyed "kind::label" so a flavour and a colour
  // that happen to share a name never collide.
  const [attributes, setAttributes] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>("featured");

  // Full price span across the catalogue (variant prices included), for hints.
  const bounds = useMemo<readonly [number, number]>(() => {
    const all = products.flatMap(productPrices);
    return all.length ? [Math.floor(Math.min(...all)), Math.ceil(Math.max(...all))] : [0, 0];
  }, [products]);

  // Attribute values grouped by kind — flavours, colours and options are shown
  // as SEPARATE facets, not one mixed list.
  const attributeGroups = useMemo(() => {
    const groups: Record<VariantKind, Map<string, number>> = {
      flavour: new Map(),
      colour: new Map(),
      option: new Map(),
    };
    for (const p of products) {
      for (const v of p.variants) {
        const kind: VariantKind =
          v.kind === "flavour" || v.kind === "colour" ? v.kind : "option";
        const label = v.label.trim();
        if (label) groups[kind].set(label, (groups[kind].get(label) || 0) + 1);
      }
      if (p.variants.length === 0 && p.flavor) {
        const f = p.flavor.trim();
        if (f) groups.flavour.set(f, (groups.flavour.get(f) || 0) + 1);
      }
    }
    return (["flavour", "colour", "option"] as const)
      .map((kind) => ({
        kind,
        title: KIND_TITLE[kind],
        options: [...groups[kind].entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([label, count]) => ({ label, count })),
      }))
      .filter((g) => g.options.length > 0);
  }, [products]);

  const filtered = useMemo(() => {
    let out = products;
    if (!lockedCategory && category !== "all") {
      out = out.filter((p) => p.category === category || p.categories.includes(category));
    }
    if (brand !== "all") out = out.filter((p) => p.brand === brand);

    const mn = minPrice === "" ? null : Number(minPrice);
    const mx = maxPrice === "" ? null : Number(maxPrice);
    if ((mn != null && Number.isFinite(mn)) || (mx != null && Number.isFinite(mx))) {
      out = out.filter((p) => {
        const prices = productPrices(p);
        if (!prices.length) return false;
        const lo = Math.min(...prices);
        const hi = Math.max(...prices);
        if (mn != null && Number.isFinite(mn) && hi < mn) return false;
        if (mx != null && Number.isFinite(mx) && lo > mx) return false;
        return true;
      });
    }

    if (inStockOnly) out = out.filter((p) => p.stock > 0);

    if (attributes.length) {
      const wanted = new Set(attributes);
      out = out.filter(
        (p) =>
          p.variants.some((v) => {
            const kind = v.kind === "flavour" || v.kind === "colour" ? v.kind : "option";
            return wanted.has(`${kind}::${v.label.trim()}`);
          }) || (p.flavor ? wanted.has(`flavour::${p.flavor.trim()}`) : false),
      );
    }

    const sorted = [...out];
    if (sort === "price-asc") sorted.sort((a, b) => a.price - b.price);
    else if (sort === "price-desc") sorted.sort((a, b) => b.price - a.price);
    else if (sort === "new")
      sorted.sort(
        (a, b) => (b.tags?.includes("new") ? 1 : 0) - (a.tags?.includes("new") ? 1 : 0),
      );
    return sorted;
  }, [products, lockedCategory, category, brand, minPrice, maxPrice, inStockOnly, attributes, sort]);

  const toggleAttribute = (key: string) =>
    setAttributes((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const activeCount =
    (!lockedCategory && category !== "all" ? 1 : 0) +
    (brand !== "all" ? 1 : 0) +
    (minPrice !== "" || maxPrice !== "" ? 1 : 0) +
    (inStockOnly ? 1 : 0) +
    attributes.length;

  const reset = () => {
    if (!lockedCategory) setCategory("all");
    setBrand("all");
    setMinPrice("");
    setMaxPrice("");
    setInStockOnly(false);
    setAttributes([]);
  };

  return {
    filtered,
    bounds,
    attributeGroups,
    activeCount,
    reset,
    toggleAttribute,
    state: { category, brand, minPrice, maxPrice, inStockOnly, attributes, sort },
    set: { setCategory, setBrand, setMinPrice, setMaxPrice, setInStockOnly, setAttributes, setSort },
  };
}

export type ProductFilters = ReturnType<typeof useProductFilters>;
