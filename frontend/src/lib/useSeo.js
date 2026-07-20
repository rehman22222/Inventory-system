import { useEffect } from "react";

// Per-route document head, hand-rolled rather than pulled from react-helmet:
// the app has exactly one page worth indexing, so a dependency would cost more
// than it saves.
//
// Anything host-dependent (canonical, og:url, JSON-LD url) is resolved here
// instead of in public/index.html. This app is deployed once per shop, and a
// canonical hardcoded to the wrong host would tell Google to drop the real
// site — so the origin comes from REACT_APP_SITE_URL and falls back to
// whatever host is actually serving the page.

const SITE_URL = (process.env.REACT_APP_SITE_URL || "").trim().replace(/\/+$/, "");

// Matches the switch in scripts/generate-seo.js. A shop's private instance
// sets this to "false" and drops out of the index entirely.
const INDEXABLE = (process.env.REACT_APP_SEO_INDEXABLE || "true").trim() !== "false";

function origin() {
  if (SITE_URL) return SITE_URL;
  return typeof window !== "undefined" ? window.location.origin : "";
}

// Creates the tag on first use and reuses it afterwards, so repeated navigation
// updates the existing tag instead of stacking duplicates.
function upsertMeta(selector, attr, name, content) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href) {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

function upsertJsonLd(id, data) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

/**
 * @param {object}  options
 * @param {string}  options.title        full <title>, already brand-suffixed
 * @param {string}  options.description  meta description, ~150-160 chars
 * @param {string}  options.path         route path, used to build the canonical
 * @param {boolean} options.noindex      keep this route out of search results
 * @param {object}  options.jsonLd       optional structured data for the route
 */
export default function useSeo({ title, description, path = "/", noindex = false, jsonLd }) {
  useEffect(() => {
    const base = origin();
    const canonical = base ? `${base}${path === "/" ? "/" : path}` : "";

    if (title) {
      document.title = title;
      upsertMeta('meta[property="og:title"]', "property", "og:title", title);
      upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
    }

    if (description) {
      upsertMeta('meta[name="description"]', "name", "description", description);
      upsertMeta('meta[property="og:description"]', "property", "og:description", description);
      upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", description);
    }

    // Always set explicitly, never left to whatever the previous route wanted.
    // The dashboards deliberately do not call this hook, so navigating from the
    // login page into the app leaves the noindex in place — which is correct.
    const hide = noindex || !INDEXABLE;
    upsertMeta(
      'meta[name="robots"]',
      "name",
      "robots",
      hide ? "noindex, nofollow" : "index, follow, max-image-preview:large"
    );

    // A canonical on a noindex page sends mixed signals, so only public pages
    // get one.
    if (canonical && !hide) {
      upsertCanonical(canonical);
      upsertMeta('meta[property="og:url"]', "property", "og:url", canonical);
    }

    if (jsonLd && !hide) {
      upsertJsonLd("seo-jsonld", jsonLd(base));
    }
  }, [title, description, path, noindex, jsonLd]);
}

/**
 * Organization + SoftwareApplication for the landing page.
 *
 * Deliberately omits `offers` and `aggregateRating`: there is no published
 * price and there are no collected reviews, and inventing either is what gets
 * a site a structured-data manual action.
 */
export function homeJsonLd(base) {
  const publisher = {
    "@type": "Organization",
    name: "Eiretech",
    email: "support@e360pro.com",
    ...(base ? { url: base } : {}),
  };

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        ...(base ? { "@id": `${base}/#organization`, url: base } : {}),
        name: "Eiretech",
        email: "support@e360pro.com",
        ...(base ? { logo: `${base}/logo512.png` } : {}),
      },
      {
        "@type": "WebSite",
        ...(base ? { "@id": `${base}/#website`, url: base } : {}),
        name: "E360 Inventory Suite",
        inLanguage: "en",
        ...(base ? { publisher: { "@id": `${base}/#organization` } } : {}),
      },
      {
        "@type": "SoftwareApplication",
        name: "E360 Inventory Suite",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web browser",
        description:
          "Inventory management and point-of-sale software for product " +
          "businesses: real-time stock control, barcode POS with split " +
          "payments, supplier and order management, analytics, role-based " +
          "access, and a full audit log.",
        featureList: [
          "Real-time stock tracking",
          "Point of sale with barcode scanning",
          "Supplier and purchase order management",
          "Sales analytics and reporting",
          "Role-based access control",
          "Audit logging",
        ],
        ...(base ? { url: base } : {}),
        publisher,
      },
    ],
  };
}
