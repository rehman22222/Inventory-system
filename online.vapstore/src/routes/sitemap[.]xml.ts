import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { storefrontForSitemap } from "@/lib/catalog-api";
import { STATIC_INDEXABLE_PATHS, canonicalPath } from "@/lib/seo";

// Sitemaps MUST use absolute URLs, or Google rejects them. Driven by SITE_URL
// (set per deploy) with the live domain as a fallback.
const BASE_URL = (process.env.SITE_URL || "https://cliffsofpuff.com").replace(/\/+$/, "");

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // Built from what is actually listed, so the sitemap follows the shop
        // rather than a hardcoded catalogue.
        const { categories, products, posts } = await storefrontForSitemap();
        const catPaths = categories.map((c) => `/category/${c.slug}`);
        const productPaths = products.map((p) => `/product/${p.id}`);
        // An article that asks not to be indexed, or that names another URL as
        // its original, is not this site's to list.
        const blogPaths = posts
          .filter((post) => !post.noindex && !post.canonicalUrl)
          .map((post) => `/blog/${post.slug}`);
        // The same normalised paths the pages declare as their canonical.
        const all = [
          ...new Set(
            [...STATIC_INDEXABLE_PATHS, ...catPaths, ...productPaths, ...blogPaths].map(canonicalPath),
          ),
        ];

        const urls = all
          .map((p) => `  <url><loc>${BASE_URL}${p}</loc><changefreq>weekly</changefreq></url>`)
          .join("\n");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
