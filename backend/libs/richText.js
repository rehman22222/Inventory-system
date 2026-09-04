/* Rich text — the one place HTML written in the back office is made safe.
 *
 * Blog articles and the legal pages are now authored in a WYSIWYG editor, so
 * what arrives from the browser is HTML rather than plain text. That HTML ends
 * up rendered verbatim on a public page, which makes this file the security
 * boundary for the whole feature: everything that reaches `content` on a post
 * or a string in `settings.policies` goes through sanitizeRichText first.
 *
 * The rule is allowlist-only. A tag, an attribute or a URL scheme that is not
 * named below does not survive — including anything the editor might grow
 * later. That is deliberate: a new editor button should have to be allowed
 * here on purpose, not arrive by accident.
 *
 * The storefront renders the result with dangerouslySetInnerHTML. It re-checks
 * a few obvious things on its own, but it is trusting this function, so treat
 * changes here as security changes.
 */

const sanitizeHtml = require("sanitize-html");

// Content that carries meaning without carrying words. Checked after
// sanitising, so by this point an <iframe> here is already a known video host.
const HAS_MEDIA = /<(img|iframe|hr)\b/i;

// Only these hosts may be framed. An <iframe> is the one tag here that runs
// somebody else's code, so it is pinned to the two video providers the editor
// can actually insert rather than left open to "any https URL".
const ALLOWED_IFRAME_HOSTS = new Set([
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "www.youtube.com",
  "youtube.com",
  "player.vimeo.com",
]);

// Alignment is the only styling an author may set, and only from this list —
// a free-form style attribute is a well-known way to smuggle behaviour and to
// wreck a layout, so `style` is filtered down to these exact declarations.
const ALLOWED_TEXT_ALIGN = new Set(["left", "center", "right", "justify"]);

const RICH_TEXT_CONFIG = {
  allowedTags: [
    "p", "br", "hr",
    "h2", "h3", "h4",
    "strong", "b", "em", "i", "u", "s", "sub", "sup", "mark",
    "ul", "ol", "li",
    "blockquote",
    "a",
    "img", "figure", "figcaption",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    "code", "pre",
    "span", "div",
    "iframe",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    iframe: [
      "src", "title", "width", "height",
      "allow", "allowfullscreen", "frameborder", "loading",
    ],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan", "scope"],
    "*": ["style", "class"],
  },
  // mailto/tel are here because a policy page routinely needs "email us" and
  // "call us" links. Everything else — javascript:, data:, vbscript: — is gone.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesAppliedToAttributes: ["href", "src"],
  // A relative href like /shop is how the shop links to its own pages, and it
  // has no scheme at all, so it must be allowed through explicitly.
  allowProtocolRelative: false,
  allowedStyles: {
    "*": {
      "text-align": [/^(left|center|right|justify)$/],
    },
  },
  // sanitize-html keeps class names by default; narrow them to the handful the
  // storefront's stylesheet actually understands so an author cannot paste in
  // markup that reaches for unrelated site styles.
  allowedClasses: {
    "*": [
      "text-left", "text-center", "text-right",
      "rich-lead", "rich-note", "rich-callout",
    ],
  },
  transformTags: {
    // Word and Google Docs paste <b>/<i>; normalise to the semantic tags so the
    // stored markup stays consistent whatever it was authored in.
    b: "strong",
    i: "em",
    a: (tagName, attribs) => {
      const href = String(attribs.href || "").trim();
      const isExternal = /^https?:\/\//i.test(href);
      return {
        tagName: "a",
        attribs: {
          ...attribs,
          href,
          // An external link opening in a new tab without noopener hands the
          // opened page a handle on ours (window.opener). Always paired.
          ...(isExternal
            ? { target: "_blank", rel: "noopener noreferrer" }
            : {}),
        },
      };
    },
    img: (tagName, attribs) => ({
      tagName: "img",
      attribs: {
        ...attribs,
        // Article images are below the fold by definition — the hero is a
        // separate field — so lazy loading them is always the right default.
        loading: "lazy",
        alt: attribs.alt || "",
      },
    }),
  },
  exclusiveFilter: (frame) => {
    // Drop an <iframe> pointing anywhere but the known video hosts. Returning
    // true removes the element.
    if (frame.tag === "iframe") {
      const src = String(frame.attribs?.src || "");
      try {
        return !ALLOWED_IFRAME_HOSTS.has(new URL(src).hostname);
      } catch {
        return true; // unparseable src — not a URL we are willing to frame
      }
    }
    return false;
  },
  // Keep empty structural tags that carry meaning on their own.
  nonTextTags: ["style", "script", "textarea", "option", "noscript"],
};

/**
 * Make author-written HTML safe to render on the storefront.
 *
 * @param {string} raw       HTML as it arrived from the editor
 * @param {number} maxLength hard cap on the stored string
 * @returns {string} sanitised HTML, or "" when there is nothing left
 */
const sanitizeRichText = (raw, maxLength = 200_000) => {
  const input = String(raw || "");
  if (!input.trim()) return "";

  const clean = sanitizeHtml(input, RICH_TEXT_CONFIG).trim();

  // An editor that has been emptied still submits its scaffolding ("<p></p>",
  // "<p><br></p>"). Treat that as empty so "is this written yet?" stays a
  // simple truthiness check everywhere else — but only when there is no media
  // either, because a block that is nothing but an image or a video embed is a
  // perfectly good piece of content with no words in it.
  if (!richTextToPlain(clean) && !HAS_MEDIA.test(clean)) return "";

  return clean.slice(0, maxLength);
};

/**
 * The words inside some HTML, with the tags gone. Used for reading time, for
 * the auto-excerpt and for "is this actually empty".
 */
const richTextToPlain = (html) =>
  sanitizeHtml(
    /* Put a space where every block boundary was, BEFORE the tags are removed.
     *
     * Stripping tags alone concatenates whatever sat either side of them, and
     * the editor emits no whitespace between blocks — "<h2>Hi</h2><p>there</p>"
     * would become "Hithere". That is two real faults, not a cosmetic one: the
     * auto-written excerpt reads as gibberish, and the word count (and so the
     * reading time) is short by one for every block in the article. */
    String(html || "").replace(
      /<\/?(?:p|div|h[1-6]|li|ul|ol|tr|td|th|blockquote|figure|figcaption|br|hr|table|thead|tbody)\b[^>]*>/gi,
      " ",
    ),
    { allowedTags: [], allowedAttributes: {} },
  )
    // sanitize-html leaves entities decoded but whitespace as-is; collapse it so
    // a word count is not thrown off by the editor's indentation.
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Rounded-up reading time in minutes, at the usual 200 words per minute. */
const readingMinutes = (html) => {
  const words = richTextToPlain(html).split(" ").filter(Boolean).length;
  return words ? Math.max(1, Math.round(words / 200)) : 0;
};

/**
 * First N characters of the prose, cut on a word boundary. Used when an author
 * leaves the excerpt blank — a missing meta description is worse than a
 * mechanical one.
 */
const excerptFrom = (html, limit = 220) => {
  const text = richTextToPlain(html);
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
};

module.exports = {
  sanitizeRichText,
  richTextToPlain,
  readingMinutes,
  excerptFrom,
};
