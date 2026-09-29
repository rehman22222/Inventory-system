/* Small pieces shared between the Online store page and the tabs that were
 * split out of it.
 *
 * These lived inside OnlineStorePage until BlogManager moved to its own file.
 * They are here rather than imported back out of that page so the two do not
 * import each other — a cycle that ESM tolerates right up until the day the
 * bundler picks the wrong order and one of them is `undefined` at render.
 */

/** A labelled form control. The label is the layout, not just text. */
/* A label and its control. Rendered as a <label> so clicking the caption
 * focuses the input — but pass as="div" for anything that is not a single
 * input. A <label> forwards every click inside it to its first control, and for
 * a rich-text editor that control is the toolbar's Undo button: each click in
 * the article silently undid the last edit, and a double-click emptied it. */
export function Field({ label, className = "", children, as: Tag = "label" }) {
  return (
    <Tag className={`form-control ${className}`}>
      <span className="mb-1 text-xs capitalize">{label}</span>
      {children}
    </Tag>
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
