import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { saleProducts } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";

export const Route = createFileRoute("/sale")({
  component: SalePage,
  head: () => ({
    meta: [
      { title: "Sale — ClipsOfPuff" },
      {
        name: "description",
        content:
          "Weekly rotating deals on disposables, nic salts, pod kits and more. Limited stock.",
      },
      { property: "og:title", content: "Sale — ClipsOfPuff" },
      { property: "og:description", content: "Up to -40% off across ClipsOfPuff." },
    ],
  }),
});

function SalePage() {
  const { products } = useCatalog();
  const list = saleProducts(products);
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="bg-ink text-primary-foreground border-b hair">
        <div className="container-x py-16 md:py-24">
          <div className="font-mono text-[11px] uppercase tracking-widest text-accent">
            Live sale · This week
          </div>
          <h1 className="mt-4 font-display text-4xl sm:text-6xl md:text-9xl leading-[0.9] md:leading-[0.85] tracking-tight break-words">
            UP TO
            <br />
            <span className="bg-accent text-accent-foreground px-3 -mx-3 inline-block">
              -40% OFF.
            </span>
          </h1>
          <p className="mt-6 max-w-lg text-primary-foreground/70">
            {list.length} products marked down. Limited stock, no rain-checks.
          </p>
        </div>
      </section>
      <section className="container-x py-12 md:py-16">
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {list.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
      <Footer />
    </div>
  );
}
