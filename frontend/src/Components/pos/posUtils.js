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

// The shop's own colours for the aisles it actually has. A cashier reaching for
// "the green one" all day is faster than one reading labels, and that only
// works if green means the same thing every shift — so these are chosen, not
// derived. Matched on a squashed name so "E-Liquids & Nic Salts", "e liquids"
// and "E-LIQUIDS" all land on the same tile.
const NAMED_TILES = [
  [/nicotinepouch|pouch/, "#558B2F"],
  [/disposable/, "#8E24AA"],
  [/eliquid|liquid|nicsalt/, "#00897B"],
  [/vapedevice|device|kit|mod/, "#E65100"],
  [/drink|beverage|soda|juice/, "#1976D2"],
  [/candy|sweet|confection/, "#F57C00"],
  [/miscellaneous|misc|other|general/, "#546E7A"],
];

// Anything the shop adds later still gets a stable colour of its own rather
// than a default grey — the same category always gets the same one.
const FALLBACK_TILES = [
  "#C2185B",
  "#5E35B1",
  "#0277BD",
  "#2E7D32",
  "#AD1457",
  "#4527A0",
  "#00695C",
  "#EF6C00",
  "#37474F",
  "#6A1B9A",
];

export const tileColor = (name = "") => {
  const squashed = String(name).toLowerCase().replace(/[^a-z]/g, "");

  for (const [pattern, colour] of NAMED_TILES) {
    if (pattern.test(squashed)) return colour;
  }

  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 100000;
  }
  return FALLBACK_TILES[hash % FALLBACK_TILES.length];
};

// The selected aisle, in the shop's amber. Dark text on it because #FFC107 is
// far too bright to carry white — a label nobody can read is not a highlight.
export const TILE_SELECTED = {
  background: "#FFC107",
  color: "#1A1A1A",
  borderColor: "#FFD54F",
};

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

// The product id of a deal item, whether it arrives populated ({_id,...}) or raw.
const itemProductId = (item) =>
  String(item?.product?._id || item?.product || "");

// Deals written before `quantityRule` existed have no such field and must keep
// charging what they charged yesterday. Mirrors resolveQuantityRule in the
// server's libs/deals.js — keep the two in step.
export const resolveQuantityRule = (deal) =>
  deal.quantityRule || (deal.mode === "mix" ? "single_set" : "repeat_sets");

const withinWindow = (deal, now) => {
  if (deal.startsAt && now < new Date(deal.startsAt).getTime()) return false;
  if (deal.endsAt && now > new Date(deal.endsAt).getTime()) return false;
  return true;
};

// Price the deals the cashier has applied. Mirrors the server's libs/deals.js so
// the till shows exactly what checkout will charge — keep the two in step.
//
// NOTHING APPLIES ON ITS OWN: a deal counts only when its id is in `chosenIds`.
// To ask "what could this basket have?" — which is what puts an offer on screen
// — call it with every deal id and compare.
//
// A percentage deal is a percentage of the DEAL'S OWN products, not of the whole
// basket, so prices travel alongside the quantities.
//
// cart: [{ productId, quantity, price }]; deals: redux deal docs.
// Returns { applied: [{ dealId, name, sets, normal, amount, products }], total }
// where `normal` is the shelf value of the units inside the sets.
export const applicableDeals = (cart, deals, chosenIds, overrides, setCounts, lockedSets, scanOrder) => {
  const cartMap = new Map();
  (cart || []).forEach((item) => {
    const key = String(item.productId);
    const seen = cartMap.get(key);
    cartMap.set(key, {
      quantity: (seen?.quantity || 0) + Number(item.quantity || 0),
      price: Number(item.price || 0),
    });
  });

  const chosen = new Set((chosenIds || []).map(String));
  const typed = new Map(
    Object.entries(overrides || {}).map(([id, price]) => [String(id), Number(price)]),
  );
  // How many complete sets the cashier chose to give. A basket can qualify for
  // two and the counter still only want to give one.
  const wanted = new Map(
    Object.entries(setCounts || {}).map(([id, n]) => [String(id), Math.floor(Number(n))]),
  );
  // Sets already given, held to the units they were given on.
  const frozen = new Map(
    Object.entries(lockedSets || {}).map(([id, alloc]) => [String(id), alloc]),
  );

  // One entry per unit, in the order it was rung up, reconciled against what
  // the basket actually holds: an entry for something no longer there is
  // skipped, and anything the log missed keeps basket order at the end. That
  // way a drifted log can never invent or lose a unit — the worst it can do is
  // order them the way the basket lists them, which is where this started.
  const scanned = [];
  if (Array.isArray(scanOrder) && scanOrder.length) {
    const left = new Map([...cartMap].map(([id, line]) => [id, Math.floor(Number(line?.quantity || 0))]));
    for (const raw of scanOrder) {
      const id = String(raw);
      const have = left.get(id) || 0;
      if (have <= 0) continue;
      left.set(id, have - 1);
      scanned.push(id);
    }
    for (const [id, have] of left) {
      for (let i = 0; i < have; i += 1) scanned.push(id);
    }
  }
  const now = Date.now();
  const applied = [];
  let total = 0;

  (deals || []).forEach((deal) => {
    if (deal.active === false) return;
    if (!chosen.has(String(deal._id))) return;
    if (!withinWindow(deal, now)) return;

    const items = Array.isArray(deal.items) ? deal.items : [];
    if (items.length === 0) return;

    const rule = resolveQuantityRule(deal);

    let sets = 0;
    let setValue = 0;
    const products = [];
    // How many units of each product ended up inside a complete set.
    const allocation = {};
    // The units in the sets, in order, so the till can lay them out set by set.
    const picked = [];

    // What the basket qualifies for is the ceiling; what the cashier asked for
    // is what is given. `maxSets` travels back so the till can offer the range.
    let maxSets = 0;
    const askedFor = wanted.get(String(deal._id));
    const capSets = (available) => {
      maxSets = available;
      return Number.isFinite(askedFor) && askedFor > 0
        ? Math.min(available, askedFor)
        : available;
    };

    if (deal.mode === "mix") {
      const need = Math.floor(Number(deal.groupQuantity || 0));
      if (need < 2) return;

      // Each unit remembers which line it came from, so the till can say "3 of
      // these 5 are in the offer" instead of badging the whole line. Walked in
      // BASKET order, not in the order the deal lists its products: with
      // everything at one price the cashier expects the first three they rang
      // up to be the set, not three from the middle.
      const eligible = new Set();
      items.forEach((item) => {
        const pid = itemProductId(item);
        eligible.add(pid);
        products.push(pid);
      });

      // Walked in the order things were actually scanned, which is not the same
      // as the order the basket lists them: the basket merges three of one
      // flavour onto one line, and the sets have to fall the way the customer
      // put them on the counter — a, b, c then a, b, d then a, b, e.
      const units = [];
      for (const id of scanned.length ? scanned : [...cartMap.keys()]) {
        if (!eligible.has(id)) continue;
        const line = cartMap.get(id);
        if (!line) continue;
        // `scanned` already holds one entry per unit; a bare key list does not.
        const have = scanned.length ? 1 : Math.floor(Number(line.quantity || 0));
        for (let i = 0; i < have; i += 1) units.push({ id, price: Number(line.price || 0) });
      }

      if (units.length < need) return;

      // Dearest first; the sort is stable, so equal prices keep basket order.
      units.sort((a, b) => b.price - a.price);

      // A set the cashier has already given is not re-chosen. Once "these three
      // for €18" is on the screen it stays on those three: scanning another of
      // one of them adds a unit at shelf price rather than quietly shuffling
      // which items are in the offer while the customer is watching.
      //
      // Safe to take from the till because it can only ever narrow the offer.
      // Left to itself this picks the dearest qualifying units, so any other
      // selection is worth the same or less — a locked set cannot be used to
      // enlarge a discount, only to hold one still.
      const locked = frozen.get(String(deal._id));
      const held = [];
      if (locked) {
        for (const [id, count] of Object.entries(locked)) {
          const line = cartMap.get(String(id));
          if (!eligible.has(String(id)) || !line) continue;
          const take = Math.min(
            Math.floor(Number(count) || 0),
            Math.floor(Number(line.quantity || 0)),
          );
          for (let i = 0; i < take; i += 1) {
            held.push({ id: String(id), price: Number(line.price || 0) });
          }
        }
      }

      // The held set is honoured while it still stands. Once it does not —
      // something in it was taken back off the basket — the offer does NOT go
      // away: it is chosen again from what is left, exactly as if it had just
      // been given. Dropping it stranded a cashier who removed one item from a
      // box of three with six other qualifying items still on the screen and
      // no offer at all.
      if (held.length >= need) {
        held.sort((a, b) => b.price - a.price);

        // What is GIVEN comes from the set that was given. What the basket
        // QUALIFIES for is still the whole basket — holding a set still must
        // not also freeze the offer at one, or scanning enough for a second
        // leaves the cashier no way to give it.
        capSets(Math.floor(units.length / need));
        sets = Math.min(
          Math.floor(held.length / need),
          Number.isFinite(askedFor) && askedFor > 0 ? askedFor : Infinity,
        );
        const inSets = held.slice(0, sets * need);
        setValue = inSets.reduce((sum, unit) => sum + unit.price, 0);
        for (const unit of inSets) {
          allocation[unit.id] = (allocation[unit.id] || 0) + 1;
          picked.push(unit.id);
        }
      } else {
        let inSets;
        if (rule === "repeat_sets") {
          sets = capSets(Math.floor(units.length / need));
          inSets = units.slice(0, sets * need);
          setValue = inSets.reduce((sum, unit) => sum + unit.price, 0);
        } else {
          sets = 1;
          inSets = deal.discountType === "setPrice" ? units.slice(0, need) : units;
          setValue = inSets.reduce((sum, unit) => sum + unit.price, 0);
        }

        inSets.forEach((unit) => {
          allocation[unit.id] = (allocation[unit.id] || 0) + 1;
          picked.push(unit.id);
        });
      }
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
      sets = capSets(rule === "single_set" ? 1 : complete);
      setValue = oneSet * sets;

      // A bundle names its contents, so the allocation is the recipe times the
      // number of sets.
      items.forEach((item) => {
        const perSet = Number(item.quantity || 1);
        if (perSet <= 0) return;
        allocation[itemProductId(item)] = perSet * sets;
      });
      for (let set = 0; set < sets; set += 1) {
        items.forEach((item) => {
          const perSet = Number(item.quantity || 1);
          for (let i = 0; i < perSet; i += 1) picked.push(itemProductId(item));
        });
      }
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
    const configuredAmount = round2(Math.max(0, Math.min(raw, setValue)));

    // A price typed at the till replaces the reduction, under the same ceiling.
    const override = typed.get(String(deal._id));
    const edited = Number.isFinite(override) && override >= 0;
    const amount = edited
      ? round2(Math.max(0, Math.min(setValue - override, setValue)))
      : configuredAmount;

    // A zero the cashier typed on purpose is kept; a zero the deal worked out
    // on its own means there is no offer here.
    if (amount <= 0 && !edited) return;

    applied.push({
      dealId: deal._id,
      name: deal.name,
      sets,
      maxSets,
      normal: round2(setValue),
      amount,
      configuredAmount,
      edited,
      products,
      picked,
      allocation,
    });
    total += amount;
  });

  return { applied, total: round2(total) };
};

// Every deal id, for the "what could this basket have?" pass that puts an offer
// on screen. The cashier's own choices are a subset of this.
export const allDealIds = (deals) =>
  (deals || []).map((deal) => String(deal._id));

// Print one till slip. Every slip lives hidden in the page and the print
// stylesheet turns on whichever one is marked, so a finished receipt sitting
// behind the dialog does not come out stapled to the shift report.
export const printSlip = (id) => {
  if (typeof document === "undefined") return;
  const node = document.getElementById(id);
  if (!node) return;

  // Move it to the top of <body> for the print, then put it straight back.
  //
  // A slip lives deep inside a scrolling dialog, and the stylesheet used to
  // reach it where it stood. In the flow directly under <body> the browser can
  // break it across pages, which is the difference between a shift report that
  // prints in full and one that stops after the first sheet.
  const anchor = document.createComment("slip");
  const root = document.createElement("div");
  root.id = "print-root";

  node.parentNode.insertBefore(anchor, node);
  root.appendChild(node);
  document.body.appendChild(root);

  document.body.classList.add("printing-slip");
  node.classList.add("is-printing");

  try {
    window.print();
  } finally {
    // Back where React left it. window.print() blocks until the dialog closes,
    // so no render can happen while the node is somewhere else.
    node.classList.remove("is-printing");
    document.body.classList.remove("printing-slip");
    anchor.parentNode.insertBefore(node, anchor);
    anchor.remove();
    root.remove();
  }
};

// Why something came back, as three fixed answers rather than free text. A shop
// that can count expired stock against damaged stock against changed minds
// knows something about itself, and that only works if the answer is the same
// word every time — "expired", "Expired" and "out of date" are three strings
// and one fact. Anything these do not cover still goes in the box beneath them.
export const REFUND_REASONS = ["expired", "damaged", "unwanted"];

// Expired and damaged goods are refunded but never resold, so they do not go
// back on the count — the unit left when it was sold and stays gone. Anything
// else is sealed stock that can be sold again. This mirrors
// backend/libs/refundReasons.js so the till can say what is about to happen;
// the server decides it for real.
export const restocksOnRefund = (reason) =>
  !["expired", "damaged"].includes(String(reason || ""));

// Stored as the key, shown in the reader's language. Refunds put through before
// this existed hold whatever was typed at the time, so anything unrecognised is
// shown as it was written rather than swallowed.
export const refundReasonLabel = (t, reason) =>
  REFUND_REASONS.includes(reason) ? t(`pos.refund.reasons.${reason}`) : reason;
