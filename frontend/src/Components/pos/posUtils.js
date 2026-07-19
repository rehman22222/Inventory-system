// Shared helpers for the POS terminal.

// The permanent catch-all category. A cashier who scans something the system
// has never seen can add it on the spot without having to decide where it
// belongs — it lands here. The name must match MISC_CATEGORY in the backend's
// productController, which is what creates and guarantees the category.
export const MISC_CATEGORY = "Miscellaneous";

// The shop picks its currency at the till. This is a *display* setting: the
// server stores plain numbers, so switching currency re-labels prices, it does
// not convert them.
export const CURRENCIES = [
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "Pound" },
  { code: "USD", symbol: "$", label: "Dollar" },
  { code: "AED", symbol: "د.إ", label: "Dirham" },
  { code: "PKR", symbol: "₨", label: "Rupee" },
  { code: "INR", symbol: "₹", label: "Rupee" },
  { code: "BDT", symbol: "৳", label: "Taka" },
];

// A sensible starting point for each language the system ships with — the
// cashier can always override it.
const CURRENCY_BY_LANGUAGE = {
  en: "EUR",
  ga: "EUR",
  ur: "PKR",
  hi: "INR",
  bn: "BDT",
  ar: "AED",
};

const KEY = "pos_currency";

let active = localStorage.getItem(KEY) || null;

export const getCurrencyCode = () => active || "EUR";

export const setCurrencyCode = (code) => {
  active = code;
  localStorage.setItem(KEY, code);
};

// Called once on POS start: adopt the language's currency only if the cashier
// has never chosen one.
export const initCurrency = (language = "en") => {
  if (!active) {
    active = CURRENCY_BY_LANGUAGE[String(language).split("-")[0]] || "EUR";
  }
  return active;
};

export const currencySymbol = () =>
  (CURRENCIES.find((entry) => entry.code === getCurrencyCode()) || CURRENCIES[0]).symbol;

export const currency = (value) =>
  `${currencySymbol()}${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Categories have no colour field in the model, so derive a stable one from the
// name — the same category always gets the same tile colour.
const TILE_COLORS = [
  "bg-rose-600",
  "bg-amber-600",
  "bg-sky-700",
  "bg-emerald-700",
  "bg-violet-700",
  "bg-orange-600",
  "bg-cyan-700",
  "bg-fuchsia-700",
  "bg-lime-700",
  "bg-indigo-700",
  "bg-teal-700",
  "bg-red-700",
];

export const tileColor = (name = "") => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 100000;
  }
  return TILE_COLORS[hash % TILE_COLORS.length];
};

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

// The product id of a deal item, whether it arrives populated ({_id,...}) or raw.
const itemProductId = (item) =>
  String(item?.product?._id || item?.product || "");

// Detect which active deals are fully present in the cart. Mirrors the server's
// libs/deals.js so the till preview matches what checkout will charge — keep the
// two in step.
//
// A percentage deal is a percentage of the DEAL'S OWN products, not of the whole
// basket, so prices travel alongside the quantities.
//
// cart: [{ productId, quantity, price }]; deals: redux deal docs.
// Returns { applied: [{ dealId, name, sets, amount, products:[ids] }], total }.
export const applicableDeals = (cart, deals) => {
  const cartMap = new Map();
  (cart || []).forEach((item) => {
    const key = String(item.productId);
    const seen = cartMap.get(key);
    cartMap.set(key, {
      quantity: (seen?.quantity || 0) + Number(item.quantity || 0),
      price: Number(item.price || 0),
    });
  });

  const applied = [];
  let total = 0;

  (deals || []).forEach((deal) => {
    if (deal.active === false) return;
    const items = Array.isArray(deal.items) ? deal.items : [];
    if (items.length === 0) return;

    let sets = Infinity;
    let setValue = 0;
    const products = [];

    items.forEach((item) => {
      const need = Number(item.quantity || 1);
      if (need <= 0) return;
      const pid = itemProductId(item);
      products.push(pid);
      const line = cartMap.get(pid);
      sets = Math.min(sets, Math.floor(Number(line?.quantity || 0) / need));
      setValue += Number(line?.price || 0) * need;
    });

    if (!Number.isFinite(sets) || sets < 1) return;

    const raw =
      deal.discountType === "percent"
        ? (setValue * sets * Number(deal.discount || 0)) / 100
        : Number(deal.discount || 0) * sets;

    // Never give back more than the deal's own goods are worth.
    const amount = round2(Math.min(raw, setValue * sets));
    if (amount <= 0) return;

    applied.push({ dealId: deal._id, name: deal.name, sets, amount, products });
    total += amount;
  });

  return { applied, total: round2(total) };
};
