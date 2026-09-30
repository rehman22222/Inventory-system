/* One place for the URL a page wants search engines to treat as its own.
 *
 * Every indexable page declares a canonical link to itself. Without one, a
 * search engine meets the same page under several addresses — with and
 * without a trailing slash, with ?sort= or ?page= or a tracking parameter on
 * the end — and has to guess which is "the" page, splitting its ranking
 * between them. A self-canonical settles it.
 *
 * Pages that should not be in search at all (cart, checkout, account, search
 * results, private review links) carry `noindex` instead and no canonical: a
 * canonical says "index me under this URL", which is the opposite of what
 * those pages mean.
 *
 * The same normalised path is what the sitemap lists, so the two always agree.
 */

export const SITE_ORIGIN = "https://cliffsofpuff.com";

/** A path reduced to the one form it is published under. */
export const canonicalPath = (path: string): string => {
  let clean = String(path || "/").split(/[?#]/)[0].trim();
  if (!clean.startsWith("/")) clean = `/${clean}`;
  clean = clean.replace(/\/{2,}/g, "/");
  // The home page is "/"; everything else has no trailing slash.
  if (clean.length > 1) clean = clean.replace(/\/+$/, "");
  return clean || "/";
};

export const canonicalUrl = (path: string) => `${SITE_ORIGIN}${canonicalPath(path)}`;

/** `<link rel="canonical">` for a route's head(). */
export const canonicalLink = (path: string) => ({ rel: "canonical", href: canonicalUrl(path) });

/** `og:url`, kept identical to the canonical so shares point at the same page. */
export const ogUrlMeta = (path: string) => ({ property: "og:url", content: canonicalUrl(path) });

/** For pages that must never appear in search results. */
export const NOINDEX_META = { name: "robots", content: "noindex, nofollow" };

/* Pages indexed by their fixed path, listed once so the routes and the sitemap
 * cannot drift apart. Categories, products, blog articles and deals are added
 * by the sitemap from live data. */
export const STATIC_INDEXABLE_PATHS = [
  "/",
  "/shop",
  "/sale",
  "/blog",
  "/about",
  "/contact",
  "/why-e-cigarettes",
  "/shipping-returns",
  "/privacy",
  "/terms",
  "/refunds",
  "/cookies",
] as const;
