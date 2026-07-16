// Deal matching — shared by the POS checkout controller and the demo-mode
// router so both apply exactly the same discount as the till previews.
//
// A deal is a set of products (each with a required quantity) and a discount
// that applies once for every complete set present in the basket: a
// "Vape + Coil = €3 off" deal with two vapes and two coils applies twice.
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

    // How many complete sets of this deal are in the basket, and what one set
    // is worth at shelf price (needed for a percentage deal).
    let sets = Infinity;
    let setValue = 0;
    const products = [];

    for (const item of items) {
      const need = Number(item.quantity || 1);
      if (need <= 0) continue;

      const id = String(item.product);
      products.push(id);

      const line = cartMap.get(id);
      const have = Number(line?.quantity || 0);
      sets = Math.min(sets, Math.floor(have / need));
      setValue += Number(line?.price || 0) * need;
    }

    if (!Number.isFinite(sets) || sets < 1) continue;

    const percent = deal.discountType === "percent";
    const raw = percent
      ? (setValue * sets * Number(deal.discount || 0)) / 100
      : Number(deal.discount || 0) * sets;

    // A deal can never hand back more than the deal's own goods are worth.
    const amount = round2(Math.min(raw, setValue * sets));
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
