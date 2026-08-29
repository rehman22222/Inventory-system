/* Why something came back decides whether it can be sold again.
 *
 * A customer who simply did not like a flavour hands back a sealed box: it goes
 * on the shelf and the count goes up. A device that came back expired or broken
 * does not — putting it back would tell the shop it owns a unit it can never
 * sell, and the next stock take would find the shortfall with nobody able to
 * explain it. The money goes back either way; only the stock differs.
 *
 * The unit was already taken off the count when it was sold, so a write-off is
 * simply *not* adding it back. There is no second movement to record and no
 * "Stock-out" to invent — the ledger already says it left the building.
 *
 * Kept here rather than in the controller because ghost mode refunds too, and a
 * demo that restocks what the real till writes off teaches the shop a number it
 * will never see.
 */

// Reasons the till offers, in the order they are shown.
const REFUND_REASONS = ["expired", "damaged", "unwanted"];

// Only these two are written off. Everything else — "unwanted", a void, a
// typed-in reason, or no reason at all — restocks, which is what a refund did
// before any of this existed and is the safe direction: stock the shop has is
// worse forgotten than double-counted, and a cashier can always adjust down.
const WRITE_OFF_REASONS = new Set(["expired", "damaged"]);

const restocksOnRefund = (reason) => !WRITE_OFF_REASONS.has(String(reason || ""));

module.exports = { REFUND_REASONS, WRITE_OFF_REASONS, restocksOnRefund };
