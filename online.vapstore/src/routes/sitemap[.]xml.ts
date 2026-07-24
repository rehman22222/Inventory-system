import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { storefrontForSitemap } from "@/lib/catalog-api";

const BASE_URL = "";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // Built from what is actually listed, so the sitemap follows the shop
        // rather than a hardcoded catalogue.
        const { categories, products } = await storefrontForSitemap();
        const staticPaths = ["/", "/shop", "/sale", "/cart"];
        const catPaths = categories.map((c) => `/category/${c.slug}`);
        const productPaths = products.map((p) => `/product/${p.id}`);
        const all = [...staticPaths, ...catPaths, ...productPaths];

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
