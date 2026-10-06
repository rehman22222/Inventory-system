type DealRouteItem = {
  enabled?: boolean;
  kind: string;
  title?: string;
  deal?: { id: string; name: string } | null;
};

const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const baseDealSlug = (item: DealRouteItem) =>
  slugify(item.title?.trim() || item.deal?.name?.trim() || "") || "offer";

export const activeDealItems = <T extends DealRouteItem>(items: T[]): T[] =>
  items.filter((item) => item?.enabled === true && item.kind === "deal" && item.deal?.id);

/**
 * Public, readable key for a deal page. Deal names normally produce a clean
 * URL such as `the-ghost-pack`. If two active cards have the same name, only
 * the duplicate gets a short id suffix so both URLs remain unambiguous.
 */
export const dealRouteKey = <T extends DealRouteItem>(item: T, allItems: T[]): string => {
  const base = baseDealSlug(item);
  const siblings = activeDealItems(allItems).filter((candidate) => baseDealSlug(candidate) === base);
  if (siblings.length <= 1 || siblings[0]?.deal?.id === item.deal?.id) return base;
  return `${base}-${item.deal?.id.slice(-6)}`;
};

/** Resolve both the new readable key and the old database id. */
export const findDealRouteItem = <T extends DealRouteItem>(items: T[], key: string): T | undefined => {
  const active = activeDealItems(items);
  return active.find(
    (item) => item.deal?.id === key || dealRouteKey(item, active) === key,
  );
};
