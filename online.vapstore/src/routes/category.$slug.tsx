import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { canonicalLink, ogUrlMeta } from "@/lib/seo";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { FilterSidebar } from "@/components/FilterSidebar";
import { brandsOf, childCategories, type Category, type Product } from "@/lib/catalog";
import { getCategoryPage } from "@/lib/catalog-api";
import { useCatalog } from "@/lib/catalog-context";
import { cldCategoryPageImage } from "@/lib/img";
import { useProductFilters, type Sort } from "@/lib/useProductFilters";
import { StorefrontNotFound } from "@/components/StorefrontNotFound";

export const Route = createFileRoute("/category/$slug")({
  component: CategoryPage,
  // Straight from the inventory backend: the category, and only the products
  // the shop has actually listed in it.
  loader: async ({ params }): Promise<{ category: Category; products: Product[] }> => {
    const { category, products } = await getCategoryPage({ data: params.slug });
    if (!category) throw notFound();
    return { category, products };
  },
  head: ({ loaderData, params }) => ({
    // Filters and sorting live in the query string; the category itself is
    // one page, so every variant points back at the bare path.
    links: [canonicalLink(`/category/${loaderData?.category.slug || params.slug}`)],
    meta: loaderData
      ? [
          { title: `${loaderData.category.name} — Cliffs of Puff` },
          {
            name: "description",
            content: `Shop ${loaderData.category.name.toLowerCase()} at Cliffs of Puff. ${loaderData.category.tagline}.`,
          },
          { property: "og:title", content: `${loaderData.category.name} — Cliffs of Puff` },
          { property: "og:description", content: loaderData.category.tagline },
          ogUrlMeta(`/category/${loaderData.category.slug}`),
        ]
      : [],
  }),
  notFoundComponent: () => (
    <StorefrontNotFound
      eyebrow="Category not found"
      title="That collection has moved."
      message="The category may have been renamed or removed. Search for what you need, or browse all products currently available."
    />
  ),
  errorComponent: () => (
    <div className="min-h-screen grid place-items-center p-8">
      <div className="text-center">
        <div className="font-display text-2xl">Something went wrong.</div>
        <p className="mt-2 text-sm text-ink-muted">Please try again later.</p>
        <Link to="/shop" className="mt-6 inline-block btn-primary">
          Back to shop
        </Link>
      </div>
    </div>
  ),
});

function CategoryPage() {
  const { category, products } = Route.useLoaderData() as {
    category: Category;
    products: Product[];
  };
  const { categories } = useCatalog();
  // Sub-categories to drill into, and the parent to climb back to. Both come
  // from the full catalogue (the loader only knows this one category).
  const kids = useMemo(() => childCategories(categories, category.slug), [categories, category.slug]);
  const parent = useMemo(
    () => (category.parentSlug ? categories.find((c) => c.slug === category.parentSlug) : null),
    [categories, category.parentSlug],
  );
  const brands = useMemo(() => brandsOf(products), [products]);
  const filters = useProductFilters(products, category.slug);
  const list = filters.filtered;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isLostMaryCategory = category.slug === "lost-mary" || /lost\s*mary/i.test(category.name);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="border-b hair bg-surface">
        <div className="container-x py-12 md:py-20 grid gap-10 md:grid-cols-[1.4fr_1fr] items-end">
          <div>
            <nav className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
              <Link to="/" className="hover:text-ink">
                Home
              </Link>
              {" / "}
              <Link to="/shop" className="hover:text-ink">
                Shop
              </Link>
              {" / "}
              {parent && (
                <>
                  <Link
                    to="/category/$slug"
                    params={{ slug: parent.slug }}
                    className="hover:text-ink"
                  >
                    {parent.name}
                  </Link>
                  {" / "}
                </>
              )}
              <span className="text-ink">{category.name}</span>
            </nav>
            {isLostMaryCategory ? (
              <h1
                className="mt-6 break-words text-5xl font-black uppercase leading-[0.85] tracking-[-0.07em] text-black sm:text-6xl md:text-8xl"
                style={{
                  fontFamily: '"Arial Black", Impact, Haettenschweiler, sans-serif',
                  fontStretch: "condensed",
                }}
              >
                Lost Mary
              </h1>
            ) : (
              <h1 className="mt-6 font-display text-4xl sm:text-5xl md:text-8xl leading-[0.95] md:leading-[0.9] tracking-tight break-words">
                {category.name.split(" ").map((w: string, i: number, arr: string[]) => (
                  <span key={i}>
                    {i === 1 ? (
                      <span
                        className="italic font-normal"
                        style={{ fontFamily: '"Instrument Serif", serif' }}
                      >
                        {w}
                      </span>
                    ) : (
                      w
                    )}
                    {i < arr.length - 1 ? " " : ""}
                  </span>
                ))}
              </h1>
            )}
            {category.tagline ? (
              <p className="mt-6 max-w-md text-base text-ink-muted">{category.tagline}</p>
            ) : null}
          </div>
          <div className="inline-block max-w-full overflow-hidden border hair bg-white leading-none md:justify-self-end">
            <img
              src={cldCategoryPageImage(category.image)}
              alt={category.name}
              loading="eager"
              decoding="async"
              sizes="(min-width: 768px) 40vw, 100vw"
              className="block h-auto max-h-[68vh] max-w-full object-contain md:max-h-[520px]"
            />
          </div>
        </div>
      </section>

      {kids.length > 0 && (
        <section className="border-b hair">
          <div className="container-x py-5 flex flex-wrap items-center gap-2">
            <span className="mr-1 font-mono text-[11px] uppercase tracking-widest text-ink-muted">
              Shop by
            </span>
            {kids.map((k) => (
              <Link
                key={k.slug}
                to="/category/$slug"
                params={{ slug: k.slug }}
                className="border hair px-3 py-1.5 font-display text-xs uppercase tracking-widest hover:bg-accent hover:text-accent-foreground"
              >
                {k.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="container-x py-10 md:py-14 grid gap-8 lg:grid-cols-[240px_1fr]">
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
          categories={[]}
          brands={brands}
          showCategory={false}
          open={filtersOpen}
        />

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
