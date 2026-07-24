import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { brandsOf, type CategorySlug } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";

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

type Sort = "featured" | "price-asc" | "price-desc" | "new";

function Shop() {
  const { categories, products } = useCatalog();
  const brands = useMemo(() => brandsOf(products), [products]);
  const [cat, setCat] = useState<CategorySlug | "all">("all");
  const [brand, setBrand] = useState<string | "all">("all");
  const [sort, setSort] = useState<Sort>("featured");
  // On phones the filter column would push the products a full screen down, so
  // it collapses behind a toggle. Always open from lg up.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = (cat !== "all" ? 1 : 0) + (brand !== "all" ? 1 : 0);

  const list = useMemo(() => {
    let out = [...products];
    if (cat !== "all") out = out.filter((p) => p.category === cat);
    if (brand !== "all") out = out.filter((p) => p.brand === brand);
    if (sort === "price-asc") out.sort((a, b) => a.price - b.price);
    if (sort === "price-desc") out.sort((a, b) => b.price - a.price);
    if (sort === "new")
      out.sort((a, b) => (b.tags?.includes("new") ? 1 : 0) - (a.tags?.includes("new") ? 1 : 0));
    return out;
  }, [products, cat, brand, sort]);

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
            {activeFilters > 0 && (
              <span className="ml-2 bg-accent text-accent-foreground px-1.5 py-0.5 font-mono text-[10px]">
                {activeFilters}
              </span>
            )}
          </span>
          <span className="font-mono text-[11px]">{filtersOpen ? "Close ✕" : "Open +"}</span>
        </button>

        {/* Filters */}
        <aside
          className={`${filtersOpen ? "block" : "hidden"} lg:block lg:sticky lg:top-40 lg:self-start space-y-8`}
        >
          <div>
            <div className="eyebrow mb-3">Categories</div>
            <ul className="space-y-1">
              <li>
                <button
                  onClick={() => setCat("all")}
                  className={`w-full text-left px-2 py-1.5 font-display text-sm uppercase tracking-widest ${cat === "all" ? "bg-ink text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground"}`}
                >
                  All
                </button>
              </li>
              {categories.map((c) => (
                <li key={c.slug}>
                  <button
                    onClick={() => setCat(c.slug)}
                    className={`w-full text-left px-2 py-1.5 font-display text-sm uppercase tracking-widest ${cat === c.slug ? "bg-ink text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground"}`}
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="eyebrow mb-3">Brands</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setBrand("all")}
                className={`font-mono text-[10px] uppercase tracking-widest px-2 py-1 border hair ${brand === "all" ? "bg-ink text-primary-foreground border-ink" : "hover:bg-accent hover:border-accent"}`}
              >
                All
              </button>
              {brands.slice(0, 10).map((b) => (
                <button
                  key={b}
                  onClick={() => setBrand(b)}
                  className={`font-mono text-[10px] uppercase tracking-widest px-2 py-1 border hair ${brand === b ? "bg-ink text-primary-foreground border-ink" : "hover:bg-accent hover:border-accent"}`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Grid */}
        <div>
          <div className="flex items-center justify-between border-b hair pb-4 mb-6">
            <div className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
              {list.length} results
            </div>
            <label className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
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
              <Link to="/shop" className="mt-4 inline-block btn-outline">
                Reset filters
              </Link>
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
