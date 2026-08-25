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
let active = "EUR";

export const getCurrencyCode = () => active || "EUR";

export const setCurrencyCode = (code) => {
  const normalized = String(code || "").trim().toUpperCase();
  active = CURRENCIES.some((entry) => entry.code === normalized) ? normalized : "EUR";
  try {
    localStorage.removeItem("pos_currency");
  } catch {
    /* private mode */
  }
  return active;
};

// Called once on POS start: adopt the language's currency only if the cashier
// has never chosen one.
export const initCurrency = () => active;

export const currencySymbol = () =>
  (CURRENCIES.find((entry) => entry.code === getCurrencyCode()) || CURRENCIES[0]).symbol;

export const currency = (value) =>
  `${currencySymbol()}${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// The till's number boxes are type="text", not type="number".
//
// A number input runs the browser's value-sanitisation step, and that step will
// not hold a half-typed decimal: handed "1." it decides the string is not a
// number and blanks the field outright. On the on-screen keypad that meant
// tapping "." wiped a price the cashier had already keyed in, and backspacing
// back through a decimal point did nothing at all. A number input also reports
// selectionStart as null, so the caret cannot be placed mid-value, and it paints
// spinner arrows that are easy to nudge by accident on a touch screen.
//
// Plain text has none of those problems. `inputMode` still raises the numeric
// pad on a device with its own keyboard, and `data-keyboard="numeric"` tells our
// on-screen one to do the same — so pair these helpers with both.

// Digits and at most one decimal point. A partial "1." is kept exactly as typed
// so the cashier can carry on to "1.50"; everything else is dropped keystroke by
// keystroke, which is what stops letters arriving from a physical keyboard.
//
// A point typed on its own becomes "0." rather than ".". That matters more than
// it looks: every caller reads these boxes with Number(), and Number(".") is
// NaN — which would spread silently through a discount, a tax rate and on into
// the basket total. With the leading zero, every string this can return is one
// Number() reads as a finite value, so no caller has to defend against it.
export const sanitizeDecimal = (raw) => {
  const cleaned = String(raw ?? "").replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  if (rest.length === 0) return whole;
  return `${whole === "" ? "0" : whole}.${rest.join("")}`;
};

// Whole numbers only — stock counts, usage limits.
export const sanitizeInteger = (raw) => String(raw ?? "").replace(/\D/g, "");

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

    let sets = 0;
    let setValue = 0;
    const products = [];

    if (deal.mode === "mix") {
      // Pick-any-N is a THRESHOLD, not a repeating set — see libs/deals.js.
      const need = Math.floor(Number(deal.groupQuantity || 0));
      if (need < 2) return;

      const units = [];
      items.forEach((item) => {
        const pid = itemProductId(item);
        products.push(pid);
        const line = cartMap.get(pid);
        const have = Math.floor(Number(line?.quantity || 0));
        for (let i = 0; i < have; i += 1) units.push(Number(line?.price || 0));
      });

      if (units.length < need) return;
      sets = 1;

      units.sort((a, b) => b - a);
      setValue =
        deal.discountType === "setPrice"
          ? units.slice(0, need).reduce((sum, price) => sum + price, 0)
          : units.reduce((sum, price) => sum + price, 0);
    } else {
      let complete = Infinity;
      let oneSet = 0;

      items.forEach((item) => {
        const need = Number(item.quantity || 1);
        if (need <= 0) return;
        const pid = itemProductId(item);
        products.push(pid);
        const line = cartMap.get(pid);
        complete = Math.min(complete, Math.floor(Number(line?.quantity || 0) / need));
        oneSet += Number(line?.price || 0) * need;
      });

      if (!Number.isFinite(complete) || complete < 1) return;
      sets = complete;
      setValue = oneSet * sets;
    }

    let raw;
    if (deal.discountType === "percent") {
      raw = (setValue * Number(deal.discount || 0)) / 100;
    } else if (deal.discountType === "setPrice") {
      raw = setValue - Number(deal.discount || 0) * sets;
    } else {
      raw = Number(deal.discount || 0) * sets;
    }

    // Never give back more than the deal's own goods are worth, and never make
    // the basket dearer than it already was.
    const amount = round2(Math.max(0, Math.min(raw, setValue)));
    if (amount <= 0) return;

    applied.push({ dealId: deal._id, name: deal.name, sets, amount, products });
    total += amount;
  });

  return { applied, total: round2(total) };
};
