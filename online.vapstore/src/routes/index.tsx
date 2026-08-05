import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CategoryTile } from "@/components/CategoryTile";
import { ProductCard } from "@/components/ProductCard";
import { bestSellers, saleProducts, topLevelCategories } from "@/lib/catalog";
import { getHero } from "@/lib/catalog-api";
import { useCatalog } from "@/lib/catalog-context";
import { HeroCarousel } from "@/components/HeroCarousel";
import { formatPrice } from "@/lib/format";
import { cldProductCardImage } from "@/lib/img";

export const Route = createFileRoute("/")({
  component: Home,
  loader: async () => ({ hero: await getHero() }),
  head: () => ({
    meta: [
      { title: "CliffsOfPuff — Premium Vapes, Pods & E-Liquid" },
      {
        name: "description",
        content:
          "CliffsOfPuff is an independent vape store. Shop pod kits, mods, disposables, nic salts and freebase e-liquid from OXVA, Voopoo, Vaporesso, Uwell and more.",
      },
      { property: "og:title", content: "CliffsOfPuff — Premium Vape Store" },
      {
        property: "og:description",
        content: "Pod kits, mods, disposables and premium e-liquid. Fast dispatch nationwide.",
      },
    ],
  }),
});

function Home() {
  const { t } = useTranslation();
  const { hero } = Route.useLoaderData();
  const { categories, products, settings } = useCatalog();
  const best = bestSellers(products, 8);
  const sale = saleProducts(products).slice(0, settings.deals.limit);
  const maxDealPercent = sale.reduce((highest, product) => {
    const dealPrice = Number(product.qtyDeal?.price ?? product.price);
    const regular = Number(
      product.qtyDeal?.regularPrice || product.regularPrice || product.compareAt || 0,
    );
    if (regular <= 0 || dealPrice >= regular) return highest;
    return Math.max(highest, Math.round(((regular - dealPrice) / regular) * 100));
  }, 0);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {hero.length > 0 && <HeroCarousel slides={hero} />}

      <section className="border-b hair py-16 md:py-24">
        <div className="container-x">
          <div className="mb-10 flex items-end justify-between gap-6">
            <div>
              <div className="eyebrow">{t("home.bestEyebrow")}</div>
              <h2 className="mt-3 font-display text-4xl leading-none tracking-tight md:text-6xl">
                {t("home.bestTitle")}
                <br />
                <span className="inline-block -mx-2 bg-ink px-2 text-primary-foreground">
                  {t("home.bestHighlight")}
                </span>
              </h2>
            </div>
            <Link to="/shop" className="btn-outline hidden md:inline-flex">
              {t("home.allProducts")}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {best.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {settings.deals.enabled && sale.length > 0 && (
        <section className="border-b hair bg-ink text-primary-foreground">
          <div className="container-x grid items-center gap-10 py-16 md:py-24 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-widest text-accent">
                {t("home.dealsEyebrow")}
              </div>
              <h2 className="mt-4 break-words font-display text-4xl leading-[0.95] tracking-tight sm:text-5xl md:text-7xl md:leading-[0.9]">
                {maxDealPercent > 0 && (
                  <>
                    {t("home.upTo")}
                    <br />
                    <span className="inline-block -mx-2 bg-accent px-2 text-accent-foreground">
                      {t("home.off", { percent: maxDealPercent })}
                    </span>
                    <br />
                  </>
                )}
                {settings.deals.title === "Weekly deals." ? "Don’t miss out." : settings.deals.title}
              </h2>
              {settings.deals.subtitle && (
                <p className="mt-6 max-w-md text-sm text-primary-foreground/70">
                  {settings.deals.subtitle}
                </p>
              )}
              <Link
                to="/sale"
                className="btn-primary mt-8 inline-flex border-accent bg-accent text-accent-foreground hover:border-primary-foreground hover:bg-primary-foreground hover:text-ink"
              >
                {settings.deals.ctaLabel} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {sale.map((product) => {
                const dealPrice = Number(product.qtyDeal?.price ?? product.price);
                const regular = Number(
                  product.qtyDeal?.regularPrice ||
                    product.regularPrice ||
                    product.compareAt ||
                    0,
                );
                const saving =
                  regular > dealPrice
                    ? Math.round(((regular - dealPrice) / regular) * 100)
                    : 0;
                return (
                  <Link
                    key={product.id}
                    to="/product/$id"
                    params={{ id: product.id }}
                    preload="intent"
                    className="group block border border-primary-foreground/20 bg-surface text-ink"
                  >
                    <div className="relative aspect-square overflow-hidden bg-white p-3">
                      <img
                        src={cldProductCardImage(product.image)}
                        alt={product.name}
                        loading="lazy"
                        decoding="async"
                        sizes="(min-width: 1024px) 25vw, 50vw"
                        className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                      {saving > 0 && (
                        <span className="absolute left-2 top-2 bg-accent px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-accent-foreground">
                          {product.qtyDeal
                            ? `Buy ${product.qtyDeal.minQty}+ · Save ${saving}%`
                            : `Save ${saving}%`}
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="font-mono text-[9px] uppercase tracking-widest text-ink-muted">
                        {product.brand}
                      </div>
                      <div className="truncate font-display text-xs leading-tight">
                        {product.name}
                      </div>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="font-display text-lg">{formatPrice(dealPrice)}</span>
                        {regular > dealPrice && (
                          <span className="font-mono text-[9px] text-ink-muted line-through">
                            {formatPrice(regular)}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="py-16 md:py-24">
        <div className="container-x">
          <div className="mb-10 flex items-end justify-between gap-6">
            <div>
              <div className="eyebrow">{t("home.categoriesEyebrow")}</div>
              <h2 className="mt-3 font-display text-4xl leading-none tracking-tight md:text-6xl">
                {t("home.shopBy")}{" "}
                <span
                  className="font-normal italic"
                  style={{ fontFamily: '"Instrument Serif", serif' }}
                >
                  {t("home.category")}
                </span>
              </h2>
            </div>
            <Link
              to="/shop"
              className="hidden px-2 py-1 font-mono text-[11px] uppercase tracking-widest hover:bg-accent hover:text-accent-foreground md:inline-flex"
            >
              {t("home.viewAll")}
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5 lg:grid-cols-4">
            {topLevelCategories(categories).map((category, index) => (
              <CategoryTile key={category.slug} category={category} index={index + 1} />
            ))}

            <Link
              to="/shop"
              className="group relative flex flex-col justify-between border hair bg-ink p-5 text-primary-foreground transition-colors hover:border-accent hover:bg-accent hover:text-accent-foreground"
            >
              <span className="font-mono text-[10px] uppercase tracking-widest opacity-70">
                {t("home.everything")}
              </span>
              <span className="mt-8 font-display text-2xl leading-none tracking-tight">
                {t("home.shopAllProducts")
                  .split("\n")
                  .map((line, index) => (
                    <span key={line}>
                      {index > 0 && <br />}
                      {line}
                    </span>
                  ))}
              </span>
              <span className="mt-6 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
                {t("home.browseCatalogue")}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
