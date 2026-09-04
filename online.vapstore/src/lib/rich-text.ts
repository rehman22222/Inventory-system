/* Helpers for author-written HTML. The component that renders it is
 * components/RichText.tsx — kept apart so this file exports no components and
 * fast refresh keeps working in both.
 *
 * Blog articles and the legal pages are written in a WYSIWYG editor in the back
 * office. What arrives here is HTML, and it has to be injected with
 * dangerouslySetInnerHTML — there is no way to render authored markup without
 * doing that.
 *
 * The real sanitising happens on the server (backend/libs/richText.js), on the
 * way IN. That is the security boundary, and it is an allowlist parser: the
 * only way a string reaches `content` or `settings.policies` is through it.
 *
 * `hardenRichText` below is a second, cruder pass on the way OUT. It is NOT
 * relied on and it is not a substitute for the server's: a regex is a bad
 * sanitiser and a determined payload will get past one. It exists because the
 * cost of being wrong here is stored XSS on a public page, and a backend that
 * is briefly misconfigured, rolled back, or restored from an old backup should
 * not turn into that. Treat it as a smoke alarm, not a fire door.
 */

const DANGEROUS_TAGS =
  /<\s*\/?\s*(script|style|object|embed|link|meta|base|form|input|button|svg|math)\b[^>]*>/gi;
// on* handlers, in either quoting style or unquoted.
const EVENT_HANDLERS = /\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
const DANGEROUS_URLS =
  /\s(?:href|src|xlink:href)\s*=\s*(?:"\s*(?:javascript|data|vbscript):[^"]*"|'\s*(?:javascript|data|vbscript):[^']*'|(?:javascript|data|vbscript):[^\s>]*)/gi;

export function hardenRichText(html: string): string {
  return String(html || "")
    .replace(DANGEROUS_TAGS, "")
    .replace(EVENT_HANDLERS, "")
    .replace(DANGEROUS_URLS, "");
}

/** Does this string carry markup, or is it plain text from the old editor? */
export function looksLikeHtml(value: string): boolean {
  return /<(p|h[1-6]|ul|ol|li|blockquote|a|img|figure|table|iframe|strong|em|br|hr|div|span)\b[^>]*>/i.test(
    String(value || ""),
  );
}
