export function formatPrice(n: number): string {
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

/** Nothing in the catalogue stops a shop from typing a very long product name,
 *  and one wordy name is enough to push a card taller than the ones beside it.
 *  Every browsing surface — cards, the search menu, the home tiles — cuts the
 *  name at the same count so the grids stay on one line. The product page and
 *  the cart show the name in full: there the customer needs all of it. */
export const PRODUCT_NAME_MAX = 30;

export function truncateProductName(name: string, max: number = PRODUCT_NAME_MAX): string {
  const clean = name.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
