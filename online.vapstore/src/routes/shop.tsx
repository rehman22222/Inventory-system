import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { FilterSidebar } from "@/components/FilterSidebar";
import { brandsOf } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { useProductFilters, type Sort } from "@/lib/useProductFilters";

export const Route = createFileRoute("/shop")({
  component: Shop,
  head: () => ({
    meta: [
      { title: "Shop All — CliffsOfPuff" },
      {
        name: "description",
        content:
          "Browse the full CliffsOfPuff catalogue: vape kits, pods, disposables, e-liquid, nic salts, tanks and accessories.",
      },
      { property: "og:title", content: "Shop All — CliffsOfPuff" },
      { property: "og:description", content: "Browse the full CliffsOfPuff vape catalogue." },
    ],
  }),
});

function Shop() {
  const { categories, products } = useCatalog();
  const brands = useMemo(() => brandsOf(products), [products]);
  const filters = useProductFilters(products);
  const list = filters.filtered;
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="border-b hair">
        <div className="container-x py-10 md:py-14">
          <div className="eyebrow">Catalogue · {products.length} products</div>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl md:text-7xl leading-[0.95] md:leading-none tracking-tight break-words">
            Shop everything.
          </h1>
        </div>
      </section>

      <section className="container-x py-8 md:py-12 grid gap-8 lg:grid-cols-[240px_1fr]">
        {/* Mobile filter toggle */}
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          className="lg:hidden flex items-center justify-between border hair px-4 py-3 font-display text-xs uppercase tracking-widest"
        >
          <span>
            Filters
            {filters.activeCount > 0 && (
              <span className="ml-2 bg-accent text-accent-foreground px-1.5 py-0.5 font-mono text-[10px]">
                {filters.activeCount}
              </span>
            )}
          </span>
          <span className="font-mono text-[11px]">{filtersOpen ? "Close ✕" : "Open +"}</span>
        </button>

        <FilterSidebar
          filters={filters}
          categories={categories}
          brands={brands}
          showCategory
          open={filtersOpen}
        />

        {/* Grid */}
        <div>
          <div className="flex items-center justify-between border-b hair pb-4 mb-6">
            <div className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
              {list.length} results
            </div>
            <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest">
              Sort
              <select
                value={filters.state.sort}
                onChange={(e) => filters.set.setSort(e.target.value as Sort)}
                className="border hair bg-background px-2 py-1 font-mono text-[11px] uppercase tracking-widest"
              >
                <option value="featured">Featured</option>
                <option value="new">Newest</option>
                <option value="price-asc">Price ↑</option>
                <option value="price-desc">Price ↓</option>
              </select>
            </label>
          </div>

          {list.length === 0 ? (
            <div className="border hair p-10 text-center">
              <div className="font-display text-2xl">No products match.</div>
              <button onClick={filters.reset} className="mt-4 inline-block btn-outline">
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
              {list.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
