// Deal matching — shared by the POS checkout controller and the demo-mode
// router so both apply exactly the same discount as the till previews.
//
// A deal is a set of products and a discount that applies once for every
// complete set present in the basket: a "Vape + Coil = €3 off" deal with two
// vapes and two coils applies twice.
//
// Two shapes of set:
//   bundle — a recipe. Each product at its own quantity, all of them present.
//   mix    — pick-any-N across the chosen products. Fifteen flavours of one pod
//            and an offer of "any 3 for €10": the shopper mixes them however
//            they like and only the total count decides.
//
// The discount is either a fixed amount per set, or a percentage OFF THE DEAL'S
// OWN PRODUCTS — not off the whole basket. A "10% off Vape + Coil" deal must not
// discount the crisps the customer also bought; that is what a voucher is for.

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

// cartMap: Map<productId(string), { quantity, price }>
// deals:   array of deal docs/objects
//          ({ _id, name, discount, discountType, active, items:[{product, quantity}] })
// Returns { applied: [{ dealId, name, sets, amount, products:[ids] }], total }
function applicableDeals(cartMap, deals) {
  const applied = [];
  let total = 0;

  for (const deal of deals || []) {
    if (deal.active === false) continue;

    const items = Array.isArray(deal.items) ? deal.items : [];
    if (items.length === 0) continue;

    // How many complete sets are in the basket, and what those sets are worth
    // at shelf price. `setValue` covers EVERY set found, not one of them.
    let sets = 0;
    let setValue = 0;
    const products = [];

    if (deal.mode === "mix") {
      // Pick-any-N is a THRESHOLD, not a repeating set. Once the basket holds
      // enough of the chosen products the offer is on, and everything after
      // that stays in it — a tenth item falling back to full price because it
      // did not complete another group of three is exactly what a shopper
      // reads as the till cheating them.
      const need = Math.floor(Number(deal.groupQuantity || 0));
      if (need < 2) continue;

      const units = [];
      for (const item of items) {
        const id = String(item.product);
        products.push(id);
        const line = cartMap.get(id);
        const have = Math.floor(Number(line?.quantity || 0));
        for (let i = 0; i < have; i += 1) units.push(Number(line?.price || 0));
      }

      if (units.length < need) continue;
      sets = 1; // the offer lands once, however far past the threshold they go

      // Dearest first. A shopper who bought a EUR 9 and a EUR 5 of the same
      // offer expects the deal on the EUR 9 — the other way round reads as a
      // short-change and is the complaint every mix-and-match till gets.
      units.sort((a, b) => b - a);

      // A set price can only price the units it names; an amount or a
      // percentage comes off everything that qualified.
      setValue =
        deal.discountType === "setPrice"
          ? units.slice(0, need).reduce((sum, price) => sum + price, 0)
          : units.reduce((sum, price) => sum + price, 0);
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
      sets = complete;
      setValue = oneSet * sets;
    }

    let raw;
    if (deal.discountType === "percent") {
      raw = (setValue * Number(deal.discount || 0)) / 100;
    } else if (deal.discountType === "setPrice") {
      // `discount` holds what the set costs, so the reduction is whatever the
      // goods were worth above it. A set already cheaper than the offer price
      // yields nothing — a deal must never make the basket dearer.
      raw = setValue - Number(deal.discount || 0) * sets;
    } else {
      raw = Number(deal.discount || 0) * sets;
    }

    // A deal can never hand back more than the deal's own goods are worth.
    const amount = round2(Math.max(0, Math.min(raw, setValue)));
    if (amount <= 0) continue;

    applied.push({
      dealId: deal._id,
      name: deal.name,
      sets,
      amount,
      products,
    });
    total += amount;
  }

  return { applied, total: round2(total) };
}

module.exports = { applicableDeals };
