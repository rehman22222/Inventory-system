import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { maxSalePercent, saleProducts } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";

export const Route = createFileRoute("/sale")({
  component: SalePage,
  head: () => ({
    meta: [
      { title: "Sale — Cliffs of Puff" },
      {
        name: "description",
        content:
          "Weekly rotating deals on disposables, nic salts, pod kits and more. Limited stock.",
      },
      { property: "og:title", content: "Sale — Cliffs of Puff" },
      {
        property: "og:description",
        content: "This week's marked-down disposables, nic salts and pod kits.",
      },
    ],
  }),
});

function SalePage() {
  const { t } = useTranslation();
  const { products } = useCatalog();
  const list = saleProducts(products);
  const percent = maxSalePercent(products);
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <section className="bg-ink text-primary-foreground border-b hair">
        <div className="container-x py-16 md:py-24">
          <div className="font-mono text-[11px] uppercase tracking-widest text-accent">
            Live sale · This week
          </div>
          <h1 className="mt-4 font-display text-4xl sm:text-6xl md:text-9xl leading-[0.9] md:leading-[0.85] tracking-tight break-words">
            {percent > 0 ? (
              <>
                {t("home.upTo")}
                <br />
                <span className="bg-accent text-accent-foreground px-3 -mx-3 inline-block">
                  {t("home.off", { percent })}.
                </span>
              </>
            ) : (
              t("sale.heading")
            )}
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
