// Shared helpers for the POS terminal.

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
