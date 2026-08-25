/* Announce that stock moved, so a till sitting idle does not keep showing a
 * number the website has already spent.
 *
 * The till and the shop share one `Product.quantity`, so the figure is never
 * wrong at write time — a guarded decrement refuses to sell what is not there.
 * What was missing is the *display*: the POS only refetched on its own actions,
 * so a web order could take the last unit and the cashier would still see it
 * until they touched something.
 *
 * The online checkout has emitted "stockChanged" per product for a while
 * (onlineStoreController, "every till … sees the new stock immediately"); a POS
 * sale never did. Same event name and same shape here, so one listener covers
 * both channels rather than two conventions drifting apart.
 *
 * The event carries the new quantity rather than a "go refetch" nudge: four
 * tills reloading a 1,600-product catalogue every time somebody buys a can of
 * Coke is the thundering herd this exists to avoid. Patching one number costs
 * nothing.
 *
 * Best-effort by design — a socket that is down must never fail a sale, so
 * failures are swallowed. The next refetch corrects the screen anyway.
 */
const emitStockChanged = (req, changes, reason = "") => {
  try {
    const io = req?.app?.get("io");
    if (!io) return;

    for (const change of Array.isArray(changes) ? changes : []) {
      const productId = String(change?.product || "");
      const quantity = Number(change?.quantity);
      if (!productId || !Number.isFinite(quantity)) continue;
      io.emit("stockChanged", { productId, quantity, reason });
    }
  } catch {
    /* realtime is best-effort — never fail a sale over a socket */
  }
};

module.exports = { emitStockChanged };
