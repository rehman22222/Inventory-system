/* What an offer built on the website actually covers.
 *
 * Kept apart from the page that draws the form because it is the whole of
 * the behaviour and none of the rendering: a test can hold the real rule
 * here without standing up a store, a router and a translation table first.
 *
 * Getting it wrong is SILENT. An offer built over the wrong products is
 * created happily, sits on a card advertising itself, and simply never
 * applies to anything a shopper can put in a basket.
 */
/* Which products a web listing actually sells.
 *
 * A deal names PRODUCTS, not listings, because that is what a basket line
 * and a stock count are. One listing can be fifteen flavours, and "any 3"
 * is meant to be satisfied by three different ones — so a listing with
 * variants contributes all of them.
 *
 * When there are variants the parent is left out: checkout sells the
 * variant, never the parent, so including it would put a product in the
 * offer that can never be bought. */
export const sellableProductIds = (listing) => {
  const variants = (listing?.variants || [])
    .map((variant) => variant?.product?._id)
    .filter(Boolean)
    .map(String);
  if (variants.length) return Array.from(new Set(variants));
  return listing?.product?._id ? [String(listing.product._id)] : [];
};
