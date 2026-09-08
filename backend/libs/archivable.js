const mongoose = require("mongoose");

/* Rows the shop has taken out of its books, hidden from every read by default.
 *
 * The superadmin can retire a run of sales — a day of testing, a till left on
 * over a demo, a batch rung up against the wrong shop. What that has to mean is
 * that the sale stops counting ANYWHERE: the sales list, the revenue and profit
 * report, the day's takings, the POS history, the credit book, the online/
 * counter split. Every one of those is a separate query in a separate
 * controller, and a feature that works by remembering to add `archivedAt: null`
 * to each of them is a feature that is one new query away from being wrong —
 * and wrong here means money on a report that the shop believes.
 *
 * So it is not remembered. It is a query hook: attach this to a schema and its
 * archived rows are gone from find, count, distinct and aggregate unless a
 * caller says otherwise in as many words. A screen written next year inherits
 * that without knowing this file exists.
 *
 * Nothing is deleted. The row keeps its place, its id and its links, and the
 * batch stamp on it is enough to put a whole archive back exactly as it was —
 * which is the difference between this and the DELETE that was being run by
 * hand against the database.
 *
 * TO INCLUDE ARCHIVED ROWS ON PURPOSE — the archive screens themselves, and
 * the restore — pass the option:
 *
 *     Sale.find(filter).setOptions({ withArchived: true })
 *     Receipt.aggregate(pipeline).option({ withArchived: true })
 *
 * A query that names `archivedAt` itself is also left alone, so
 * `find({ archivedAt: { $ne: null } })` means what it looks like.
 */

const ARCHIVE_FIELDS = {
  // Null means live. Everything else on this block is set at the same moment
  // and is meaningless without it, so this one field is the whole test.
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  // Kept beside the id for the same reason every other record here keeps a
  // name: the archive list has to say who did it without a join, and it has to
  // keep saying so after the account is gone.
  archivedByName: { type: String },
  // One stamp per archive action, shared by every row that went with it. This
  // is what makes an archive a THING rather than a scatter of flags — it is
  // how the list groups them, and how a restore finds its way back.
  archiveBatch: { type: String, default: null },
  archiveReason: { type: String },
};

// Does this query already speak for itself about archived rows?
const asksForArchived = (query) =>
  Boolean(query) && Object.prototype.hasOwnProperty.call(query, "archivedAt");

function archivable(schema) {
  schema.add(ARCHIVE_FIELDS);

  // Live rows are the overwhelming majority and every list is date-ordered, so
  // the flag leads and the date follows it.
  schema.index({ archivedAt: 1, createdAt: -1 });
  schema.index({ archiveBatch: 1 });

  function hide() {
    if (this.getOptions && this.getOptions().withArchived) return;
    if (asksForArchived(this.getQuery ? this.getQuery() : null)) return;
    this.where({ archivedAt: null });
  }

  /* find, findOne, findOneAndUpdate, findOneAndDelete — the whole family.
   *
   * Writes are covered as deliberately as reads: an archived sale must not be
   * edited or refunded by a screen that cannot see it is archived, and letting
   * an update through would leave a row that is out of the books and still
   * moving. */
  schema.pre(/^find/, hide);
  schema.pre(/^count/, hide);
  schema.pre("distinct", hide);
  schema.pre(/^update/, hide);
  schema.pre("replaceOne", hide);

  /* Aggregations get the same rule as a first stage.
   *
   * Unshifted rather than appended so it runs before any $lookup or $group has
   * had a chance to fold an archived row into a total — and, on a collection
   * this size, so the index above can still be used. */
  schema.pre("aggregate", function () {
    if (this.options && this.options.withArchived) return;
    const [first] = this.pipeline();
    if (first && first.$match && asksForArchived(first.$match)) return;
    this.pipeline().unshift({ $match: { archivedAt: null } });
  });
}

module.exports = { archivable, ARCHIVE_FIELDS };
