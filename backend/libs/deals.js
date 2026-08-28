// Deal matching — shared by the POS checkout controller and the demo-mode
// router so both apply exactly the same discount as the till previews.
//
// A deal is a set of products and a discount. Two shapes of set:
//   bundle — a recipe. Each product at its own quantity, all of them present.
//   mix    — pick-any-N across the chosen products. Fifteen flavours of one pod
//            and an offer of "any 3 for €10": the shopper mixes them however
//            they like and only the total count decides.
//
// How many times one deal can land in a basket is the deal's own
// `quantityRule` — see resolveQuantityRule below.
//
// The discount is either a fixed amount per set, a percentage OFF THE DEAL'S
// OWN PRODUCTS — not off the whole basket — or `setPrice`, where `discount`
// holds what one set costs rather than what comes off it.
//
// NOTHING APPLIES ON ITS OWN. A deal counts only when the till passes its id in
// `chosenIds`: the cashier is shown what is available and presses Apply. This
// function is what detects and prices the offer; it never decides to give it.

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

// Deals written before `quantityRule` existed have no such field, and must keep
// charging exactly what they charged yesterday. Absence therefore means "what
// this mode always did": bundle repeated for every complete set, mix landed
// once past its threshold.
const resolveQuantityRule = (deal) =>
  deal.quantityRule || (deal.mode === "mix" ? "single_set" : "repeat_sets");

// An optional run of dates, so a seasonal offer stops on its own.
const withinWindow = (deal, now) => {
  if (deal.startsAt && now < new Date(deal.startsAt).getTime()) return false;
  if (deal.endsAt && now > new Date(deal.endsAt).getTime()) return false;
  return true;
};

// cartMap:   Map<productId(string), { quantity, price }>
// deals:     array of deal docs/objects
// chosenIds: the deal ids the cashier applied. Nothing is priced without it —
//            pass every id to ask "what could this basket have?" instead.
// overrides: { dealId: priceTheCashierTyped } for offers hand-priced at the
//            till. The typed figure is what the DEAL PORTION costs, all sets
//            together — the number on the screen, not a per-set rate. It is
//            clamped to what the goods are worth either way, so the worst a
//            till can do is give the shop's own stock away, never mint money.
//
// Returns { applied: [{ dealId, name, sets, normal, amount, configuredAmount,
// edited, products }], total } where `normal` is what the units inside the sets
// cost at shelf price, so the till can show "Normal 21 / Deal 18 / Saving 3"
// without doing the sum again, and `configuredAmount` is what the deal as
// written would have given — kept apart from `amount` so a hand-priced sale can
// be told from an ordinary one afterwards.
function applicableDeals(cartMap, deals, chosenIds, overrides, setCounts) {
  const chosen = new Set((chosenIds || []).map(String));
  const typed = new Map(
    Object.entries(overrides || {}).map(([id, price]) => [String(id), Number(price)]),
  );
  // How many complete sets the cashier chose to give. A basket can qualify for
  // two and the counter still only want to give one — that is the shop's call
  // to make at the moment of sale, not the matcher's.
  const wanted = new Map(
    Object.entries(setCounts || {}).map(([id, n]) => [String(id), Math.floor(Number(n))]),
  );
  const now = Date.now();
  const applied = [];
  let total = 0;

  for (const deal of deals || []) {
    if (deal.active === false) continue;
    if (!chosen.has(String(deal._id))) continue;
    if (!withinWindow(deal, now)) continue;

    const items = Array.isArray(deal.items) ? deal.items : [];
    if (items.length === 0) continue;

    const rule = resolveQuantityRule(deal);

    // How many complete sets are in the basket, and what those sets are worth
    // at shelf price. `setValue` covers EVERY set counted, not one of them.
    let sets = 0;
    let setValue = 0;
    const products = [];
    // How many units of each product ended up inside a complete set.
    const allocation = {};

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
      if (need < 2) continue;

      // Each unit remembers which line it came from, so the till can say "3 of
      // these 5 are in the offer" instead of badging the whole line. Five items
      // on a 3-for deal is three at the deal and two at shelf price, and a
      // customer reading the receipt has to be able to see that.
      const units = [];
      for (const item of items) {
        const id = String(item.product);
        products.push(id);
        const line = cartMap.get(id);
        const have = Math.floor(Number(line?.quantity || 0));
        for (let i = 0; i < have; i += 1) units.push({ id, price: Number(line?.price || 0) });
      }

      if (units.length < need) continue;

      // Dearest first. A shopper who bought a EUR 9 and a EUR 5 of the same
      // offer expects the deal on the EUR 9 — the other way round reads as a
      // short-change and is the complaint every mix-and-match till gets.
      units.sort((a, b) => b.price - a.price);

      let inSets;
      if (rule === "repeat_sets") {
        // Every complete group, and the units that did not fill one are simply
        // outside the offer — which is what makes a leftover cost shelf price
        // without needing a rule of its own.
        sets = capSets(Math.floor(units.length / need));
        inSets = units.slice(0, sets * need);
        setValue = inSets.reduce((sum, unit) => sum + unit.price, 0);
      } else {
        sets = 1;
        // A set price can only price the units it names; an amount or a
        // percentage comes off everything that qualified.
        inSets =
          deal.discountType === "setPrice" ? units.slice(0, need) : units;
        setValue = inSets.reduce((sum, unit) => sum + unit.price, 0);
      }

      for (const unit of inSets) {
        allocation[unit.id] = (allocation[unit.id] || 0) + 1;
      }
    } else {
      let complete = Infinity;
      let oneSet = 0;

      for (const item of items) {
        const need = Number(item.quantity || 1);
        if (need <= 0) continue;

        const id = String(item.product);
        products.push(id);

        const line = cartMap.get(id);
        const have = Number(line?.quantity || 0);
        complete = Math.min(complete, Math.floor(have / need));
        oneSet += Number(line?.price || 0) * need;
      }

      if (!Number.isFinite(complete) || complete < 1) continue;
      sets = capSets(rule === "single_set" ? 1 : complete);
      setValue = oneSet * sets;

      // A bundle names its contents, so the allocation is the recipe times the
      // number of sets — a basket with four coils on a "1 vape + 2 coils" deal
      // has two coils in the offer and two at shelf price.
      for (const item of items) {
        const perSet = Number(item.quantity || 1);
        if (perSet <= 0) continue;
        allocation[String(item.product)] = perSet * sets;
      }
    }

    let raw;
    if (deal.discountType === "percent") {
      raw = (setValue * Number(deal.discount || 0)) / 100;
    } else if (deal.discountType === "setPrice") {
      // `discount` holds what one set costs, so the reduction is whatever the
      // goods were worth above it. A set already cheaper than the offer price
      // yields nothing — a deal must never make the basket dearer.
      raw = setValue - Number(deal.discount || 0) * sets;
    } else {
      raw = Number(deal.discount || 0) * sets;
    }

    // A deal can never hand back more than the deal's own goods are worth.
    const configuredAmount = round2(Math.max(0, Math.min(raw, setValue)));

    // A price typed at the till replaces the reduction, under the same ceiling:
    // the discount still cannot exceed the value of the deal's own goods, so an
    // edit can only ever move money within this sale.
    const override = typed.get(String(deal._id));
    const edited = Number.isFinite(override) && override >= 0;
    const amount = edited
      ? round2(Math.max(0, Math.min(setValue - override, setValue)))
      : configuredAmount;

    // An offer worth nothing is not an offer — but a cashier who deliberately
    // priced a set at its shelf value has said something, so a zero they typed
    // is kept rather than silently dropped.
    if (amount <= 0 && !edited) continue;

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
      // Which units are actually in the offer. Five items on a 3-for deal are
      // three at the deal and two at shelf price, and both the basket line and
      // the receipt have to be able to say so.
      allocation,
    });
    total += amount;
  }

  return { applied, total: round2(total) };
}

module.exports = { applicableDeals, resolveQuantityRule };
