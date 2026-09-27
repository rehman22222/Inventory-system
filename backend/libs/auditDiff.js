/* Before/after for the activity log.
 *
 * "Product X was updated" answers who and when, but not what — and "what" is
 * the question that actually gets asked. When somebody wants to know whether a
 * price was cut, the only other place the old figure survives is the sales
 * history, and only for a product that happened to sell. A deal keeps nothing
 * at all.
 *
 * So an edit snapshots the fields it can change BEFORE touching the record,
 * and compares afterwards. What comes out is two things:
 *
 *   - `changes`: [{ field, from, to }], stored on the log entry for querying.
 *   - a short sentence ("price 35 → 29.99; name …") appended to the
 *     description, so the existing activity screen shows it with no UI change.
 *
 * Values are normalised before comparing: an ObjectId and its string are the
 * same category, a Date and its ISO string are the same date, and 35 and "35"
 * are the same price. Without that, every save would report changes to fields
 * nobody touched.
 */

const MAX_TEXT = 200;

const normalise = (value) => {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  // ObjectId, or a populated document standing in for one.
  if (typeof value === "object") {
    if (value._bsontype === "ObjectId" || value._bsontype === "ObjectID") return String(value);
    if (value._id) return String(value._id);
    return JSON.stringify(value).slice(0, MAX_TEXT);
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  return String(value).slice(0, MAX_TEXT);
};

// Numeric strings compare as numbers so "35" and 35 are not a change.
const same = (a, b) => {
  if (a === b) return true;
  if (a === null || b === null) return false;
  const na = Number(a);
  const nb = Number(b);
  return typeof a !== "boolean" && typeof b !== "boolean" &&
    a !== "" && b !== "" && Number.isFinite(na) && Number.isFinite(nb) && na === nb;
};

/**
 * Read the named fields off a document (or plain object) into a frozen record.
 * Call this BEFORE mutating the document.
 */
const snapshot = (doc, fields) => {
  const out = {};
  for (const field of fields) out[field] = normalise(doc ? doc[field] : undefined);
  return out;
};

/**
 * Compare a snapshot with the document as it now stands.
 * @returns {{ field: string, from: any, to: any }[]}
 */
const diff = (before, doc, fields) => {
  const after = snapshot(doc, fields);
  return fields
    .filter((field) => !same(before[field], after[field]))
    .map((field) => ({ field, from: before[field], to: after[field] }));
};

const show = (value) => {
  if (value === null) return "(empty)";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  return typeof value === "string" ? `"${value}"` : String(value);
};

/**
 * One line for the description. `labels` renames fields for people
 * ({ Price: "price" }); fields listed in `opaque` (ids, long text) are named as
 * changed without printing values that would mean nothing on screen.
 */
const describe = (changes, { labels = {}, opaque = [] } = {}) =>
  changes
    .map(({ field, from, to }) => {
      const label = labels[field] || field;
      if (opaque.includes(field)) return `${label} changed`;
      return `${label} ${show(from)} → ${show(to)}`;
    })
    .join("; ");

module.exports = { snapshot, diff, describe, normalise };
