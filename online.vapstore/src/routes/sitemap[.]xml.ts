import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { storefrontForSitemap } from "@/lib/catalog-api";
import { SITE_ORIGIN, STATIC_INDEXABLE_PATHS, canonicalPath } from "@/lib/seo";

const xmlEscape = (value: string) =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // Built from what is actually listed, so the sitemap follows the shop
        // rather than a hardcoded catalogue.
        const { categories, products, posts, dealIds } = await storefrontForSitemap();
        const paths = [
          ...STATIC_INDEXABLE_PATHS.map((path) => ({ path })),
          ...categories.map((category) => ({ path: `/category/${category.slug}` })),
          ...products.map((product) => ({ path: `/product/${product.id}` })),
          ...dealIds.map((id) => ({ path: `/deal/${id}` })),
        ];

        // An article that asks not to be indexed, or that names another URL as
        // its original, is not this site's to list.
        paths.push(
          ...posts
            .filter((post) => !post.noindex && !post.canonicalUrl)
            .map((post) => ({ path: `/blog/${post.slug}` })),
        );

        // Keep one entry per canonical URL. Dynamic data can legitimately
        // contain the same item more than once while catalogue links merge.
        const unique = [...new Set(paths.map(({ path }) => canonicalPath(path)))];

        const urls = unique
          // `lastmod` is deliberately omitted: the catalogue currently exposes
          // publication dates, not reliable modification dates. A missing value
          // is better crawler data than a timestamp that changes inaccurately.
          .map((path) => `  <url><loc>${xmlEscape(`${SITE_ORIGIN}${path}`)}</loc></url>`)
          .join("\n");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
