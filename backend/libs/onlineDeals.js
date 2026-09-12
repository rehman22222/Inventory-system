/* Set offers on the website: "any 3 for €10", mixed across flavours.
 *
 * THIS FILE DOES NOT DECIDE WHAT A DEAL IS WORTH. libs/deals.js does, and it
 * is the same code the till runs. Everything here is translation: turn a
 * basket of online order lines into the shape that engine expects, ask it, and
 * hand the answer back. A second implementation of "any N for X" is how a shop
 * ends up with the counter and the website charging different money for the
 * same goods, and the shop finds out from a customer.
 *
 * WHICH DEALS REACH THE WEBSITE. Not all of them. Deals are built for the till
 * and some are meant to stay there — staff offers, clearance the shop is
 * walking round with. A deal applies online only once it has been placed on an
 * events card in the online store's settings, which is a deliberate act. So
 * turning this on cannot silently start discounting every order the shop takes.
 *
 * WHERE IT APPLIES. Anywhere in the basket. A deal is judged on what the
 * shopper is buying, not on which page they were standing on when they added
 * it: three pods found through search and two more from the category page are
 * five pods, and the offer is for five pods. The till works this way too, and
 * a shopper who had to enter through the right door to get the advertised
 * price would reasonably call that a trick.
 *
 * NOBODY PRESSES APPLY. At the counter a deal is offered and the cashier takes
 * it; there is no cashier here, so every deal the shop put on the website is
 * passed as chosen and the engine gives what the basket has earned.
 */

const { applicableDeals } = require("./deals");

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

/* The deals the shop has actually put on the website.
 *
 * Only from cards that are switched on: unticking "Show" takes the card off
 * the page, and an offer nobody can see advertised should not still be quietly
 * discounting baskets. */
const eventDealIds = (settings) => {
  const items = settings?.events?.items;
  if (!settings?.events?.enabled || !Array.isArray(items)) return [];

  const ids = [];
  for (const item of items) {
    // Only a card that IS an offer. A product card carries none, and the
    // server clears any that arrives on one, but reading the kind here says
    // so plainly rather than relying on that having happened.
    if (!item?.enabled || item.kind !== "deal" || !item.deal) continue;
    const id = String(item.deal._id || item.deal);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
};

/* What this basket earns.
 *
 * `lines` are the resolved order lines — server-owned prices, never the
 * browser's. Keyed by PRODUCT, because that is what a deal names: a listing
 * with fifteen flavours is fifteen products, and "any 3" is meant to be
 * satisfied by three different ones.
 *
 * `room` is what is left to discount after everything else has taken its
 * share. Clamped, because a deal must never be able to hand back more than the
 * basket is worth — the same guard the till applies. */
const priceEventDeals = (lines, deals, room = Infinity) => {
  if (!Array.isArray(lines) || !lines.length || !Array.isArray(deals) || !deals.length) {
    return { discount: 0, applied: [] };
  }

  const cartMap = new Map();
  for (const line of lines) {
    const id = String(line?.product?._id || line?.product || "");
    if (!id) continue;
    const seen = cartMap.get(id);
    // One listing can put the same product in the basket more than once; the
    // engine counts units, so they are added together rather than overwriting.
    if (seen) {
      seen.quantity += Number(line.quantity || 0);
    } else {
      cartMap.set(id, {
        quantity: Number(line.quantity || 0),
        price: Number(line.price || 0),
      });
    }
  }
  if (!cartMap.size) return { discount: 0, applied: [] };

  const result = applicableDeals(
    cartMap,
    deals,
    deals.map((deal) => String(deal._id)),
  );

  const discount = round2(Math.max(0, Math.min(result.total, room)));
  return { discount, applied: result.applied };
};

module.exports = { eventDealIds, priceEventDeals };
