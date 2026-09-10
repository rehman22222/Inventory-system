/* Which products are new, and where they sit in the list.
 *
 * Kept apart from the page that draws them because they are the whole of the
 * behaviour and none of the rendering: a test can hold the real rule here
 * without standing up a store, a router and a translation table first — and a
 * rule that is awkward to test is a rule that quietly stops being tested. */
/* How long a product counts as new.
 *
 * Long enough to still be there when somebody comes back to the list after
 * putting the stock out, short enough that the badge means something — a mark
 * on half the catalogue is not a mark at all.
 *
 * This is a BACK OFFICE mark. The till never shows it: `createdAt` is not even
 * in the projection the POS fetches, so a cashier's grid is unaffected. */
const NEW_PRODUCT_HOURS = 24;

export const isNewProduct = (product) => {
  const added = Date.parse(product?.createdAt || "");
  if (Number.isNaN(added)) return false;
  return Date.now() - added < NEW_PRODUCT_HOURS * 60 * 60 * 1000;
};

/* Whatever is wearing the NEW chip sits at the top, newest first.
 *
 * The same rule draws the chip and does the lifting, so the two can never
 * disagree: anything marked NEW is up here, and when the mark expires the row
 * settles back into the list on its own with nothing to clean up.
 *
 * ONLY the new ones move. Everything else keeps the order it arrived in — that
 * is what a stable sort buys us. The shop just added one product and wants to
 * see it, not to have five hundred rows reshuffled underneath it.
 *
 * Called before the list is sliced into pages, or "top" would only ever mean
 * the top of whichever page you happen to be looking at.
 *
 * On a COPY. The array handed in is the store's, and sorting in place would
 * reorder state behind the reducer's back. */
export const newestFirst = (source) => {
  if (!Array.isArray(source)) return [];

  return source.slice().sort((a, b) => {
    const aNew = isNewProduct(a);
    const bNew = isNewProduct(b);
    if (aNew !== bNew) return aNew ? -1 : 1;
    if (!aNew) return 0;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
};
