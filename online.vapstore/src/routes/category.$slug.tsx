import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import type { Category, Product } from "@/lib/catalog";
import { getCategoryPage } from "@/lib/catalog-api";

export const Route = createFileRoute("/category/$slug")({
  component: CategoryPage,
  // Straight from the inventory backend: the category, and only the products
  // the shop has actually listed in it.
  loader: async ({ params }): Promise<{ category: Category; products: Product[] }> => {
    const { category, products } = await getCategoryPage({ data: params.slug });
    if (!category) throw notFound();
    return { category, products };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.category.name} — CliffsOfPuff` },
          {
            name: "description",
            content: `Shop ${loaderData.category.name.toLowerCase()} at CliffsOfPuff. ${loaderData.category.tagline}.`,
          },
          { property: "og:title", content: `${loaderData.category.name} — CliffsOfPuff` },
          { property: "og:description", content: loaderData.category.tagline },
        ]
      : [],
  }),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-8">
      <div className="text-center">
        <div className="font-display text-4xl">Category not found</div>
        <Link to="/shop" className="mt-6 inline-block btn-primary">
          Back to shop
        </Link>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-8">
      <div className="text-center">
        <div className="font-display text-2xl">Something went wrong</div>
        <div className="mt-2 text-sm text-ink-muted">{error.message}</div>
      </div>
    </div>
  ),
});

function CategoryPage() {
  const { category, products } = Route.useLoaderData() as {
    category: Category;
    products: Product[];
  };

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
              <span className="text-ink">{category.name}</span>
            </nav>
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
            <p className="mt-6 max-w-md text-base text-ink-muted">
              {category.tagline}. {products.length} products in stock.
            </p>
          </div>
          <div className="border hair overflow-hidden bg-background aspect-[4/5] md:aspect-square">
            <img src={category.image} alt={category.name} className="h-full w-full object-cover" />
          </div>
        </div>
      </section>

      <section className="container-x py-12 md:py-16">
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
}
