/* Small pieces shared between the Online store page and the tabs that were
 * split out of it.
 *
 * These lived inside OnlineStorePage until BlogManager moved to its own file.
 * They are here rather than imported back out of that page so the two do not
 * import each other — a cycle that ESM tolerates right up until the day the
 * bundler picks the wrong order and one of them is `undefined` at render.
 */

/** A labelled form control. The label is the layout, not just text. */
export function Field({ label, className = "", children }) {
  return (
    <label className={`form-control ${className}`}>
      <span className="mb-1 text-xs capitalize">{label}</span>
      {children}
    </label>
  );
}

/* An ISO timestamp as <input type="datetime-local"> wants it: local wall-clock
 * time, no zone, minute precision. toISOString() alone would hand the field a
 * UTC time and quietly shift a publish date by the offset. */
export const toLocalDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};

/** Where the public website lives, for "view this on the site" links. */
export const storefrontPublicUrl = (
  process.env.REACT_APP_STOREFRONT_URL || "https://cliffsofpuff.com"
).replace(/\/$/, "");
