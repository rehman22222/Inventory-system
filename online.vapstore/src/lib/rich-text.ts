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

/* ── Articles pasted in rather than written in the editor ──────────────────
 *
 * Text pasted from a document or another site often arrives as one enormous
 * paragraph held together with line breaks: a "heading" is just a bold line
 * between two blank lines, and a list is "• one • two • three" on a single
 * line. Styled as it stands, that is a wall of grey text with nothing to
 * navigate by.
 *
 * `tidyArticleHtml` recovers the structure the author meant, at render time
 * only — the stored article is not changed, and properly written articles
 * (real <h2>s, real lists, one idea per paragraph) pass through untouched,
 * because the patterns below only exist in pasted text:
 *
 *   - a blank line (<br><br>) inside a paragraph starts a new paragraph;
 *   - a short bold line standing on its own becomes a section heading
 *     (unless it ends in ":" — that is a lead-in, and stays bold text);
 *   - two or more "•" in one paragraph become a bulleted list.
 *
 * Everything it emits is markup the server's allowlist already permits, and
 * its input is the server-sanitised article, so it adds nothing to escape. */

const BLANK_LINE = /(?:\s*<br\s*\/?>\s*){2,}/i;
// A bold run standing alone at the start of a block, optionally followed by a
// line break and the block's text.
const LEADING_BOLD_LINE = /^<(strong|b)>([^<]{2,140}?)\s*<\/\1>\s*(?:<br\s*\/?>\s*([\s\S]*))?$/i;
const BULLET = "•";

const trimBreaks = (html: string) => html.replace(/^(?:\s|<br\s*\/?>)+|(?:\s|<br\s*\/?>)+$/gi, "");

function bulletsToList(html: string): string {
  const parts = html.split(BULLET);
  if (parts.length < 3) return html ? `<p>${html}</p>` : "";
  const lead = trimBreaks(parts[0]);
  const items = parts
    .slice(1)
    .map((item) => trimBreaks(item))
    .filter(Boolean)
    .map((item) => `<li>${item}</li>`)
    .join("");
  return `${lead ? `<p>${lead}</p>` : ""}<ul>${items}</ul>`;
}

function tidyBlock(block: string): string {
  const text = trimBreaks(block);
  if (!text) return "";
  const heading = LEADING_BOLD_LINE.exec(text);
  if (heading) {
    const title = heading[2].trim();
    const rest = trimBreaks(heading[3] || "");
    // "Before buying, check:" introduces what follows; it is not a section.
    const head = /[:：]$/.test(title) ? `<p><strong>${title}</strong></p>` : `<h2>${title}</h2>`;
    return head + (rest ? tidyBlock(rest) : "");
  }
  return bulletsToList(text);
}

export function tidyArticleHtml(html: string): string {
  const source = String(html || "");
  // Nothing pasted-looking: leave a properly structured article exactly alone.
  if (!BLANK_LINE.test(source) && !source.includes(BULLET)) return source;
  return source.replace(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi, (whole, inner: string) => {
    if (!BLANK_LINE.test(inner) && !inner.includes(BULLET) && !LEADING_BOLD_LINE.test(trimBreaks(inner))) {
      return whole;
    }
    return inner.split(BLANK_LINE).map(tidyBlock).join("");
  });
}

/** Does this string carry markup, or is it plain text from the old editor? */
export function looksLikeHtml(value: string): boolean {
  return /<(p|h[1-6]|ul|ol|li|blockquote|a|img|figure|table|iframe|strong|em|br|hr|div|span)\b[^>]*>/i.test(
    String(value || ""),
  );
}
