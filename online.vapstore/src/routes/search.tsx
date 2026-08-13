import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { useCatalog } from "@/lib/catalog-context";

export const Route = createFileRoute("/search")({
  // ?q= drives the search. Kept a plain string so a shared/bookmarked search URL
  // works and SSR can render results on first paint.
  validateSearch: (search: Record<string, unknown>): { q?: string } => {
    const q = typeof search.q === "string" ? search.q.trim() : "";
    return q ? { q } : {};
  },
  component: SearchPage,
  head: () => ({
    meta: [
      { title: "Search — Cliffs of Puff" },
      // A search results page should never be indexed.
      { name: "robots", content: "noindex" },
    ],
  }),
});

function SearchPage() {
  const { q = "" } = Route.useSearch();
  const navigate = useNavigate();
  const { products, categories } = useCatalog();
  const [term, setTerm] = useState(q);

  // Keep the input in step when the query changes via the header or a back/forward.
  useEffect(() => {
    setTerm(q);
  }, [q]);

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.slug, c.name.toLowerCase()]));
    return (slug: string) => map.get(slug) || slug.replace(/-/g, " ");
  }, [categories]);

  // All listed products are already in the catalogue context, so search is a
  // pure in-memory filter — instant, no extra request. Every whitespace token
  // must appear somewhere in the product's searchable text (name, brand,
  // flavour, category, tags, option labels).
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    const tokens = query.split(/\s+/).filter(Boolean);
    return products.filter((product) => {
      const haystack = [
        product.name,
        product.brand,
        product.flavor || "",
        product.short || "",
        product.category,
        categoryName(product.category),
        ...product.categories.map(categoryName),
        ...(product.tags || []),
        ...product.variants.map((variant) => variant.label),
      ]
        .join(" ")
        .toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [products, q, categoryName]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate({ to: "/search", search: { q: term.trim() } });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="border-b hair">
        <div className="container-x py-8 md:py-12">
          <div className="eyebrow">Search</div>
          <form onSubmit={submit} className="mt-4 flex max-w-2xl items-center border hair">
            <Search className="ml-3 h-4 w-4 shrink-0 text-ink-muted" />
            <input
              autoFocus
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search devices, flavours, brands…"
              className="w-full bg-transparent px-3 py-3 text-sm outline-none placeholder:text-ink-muted"
            />
            <button
              type="submit"
              className="bg-ink px-5 py-3 font-mono text-[11px] uppercase tracking-widest text-primary-foreground"
            >
              Search
            </button>
          </form>
          {q.trim() !== "" && (
            <p className="mt-4 text-sm text-ink-muted">
              {results.length} result{results.length === 1 ? "" : "s"} for “{q.trim()}”
            </p>
          )}
        </div>
      </section>

      <section className="container-x py-8 md:py-12">
        {q.trim() === "" ? (
          <p className="text-ink-muted">Type something above to search the shop.</p>
        ) : results.length === 0 ? (
          <div className="border hair p-10 text-center">
            <div className="font-display text-2xl">No products match “{q.trim()}”.</div>
            <p className="mt-2 text-sm text-ink-muted">
              Try a brand, a flavour, or a device name.
            </p>
            <Link to="/shop" className="mt-5 inline-block btn-outline">
              Browse all products
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {results.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      <Footer />
    </div>
  );
}
