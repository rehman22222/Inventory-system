import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CategoryTile } from "@/components/CategoryTile";
import { ProductCard } from "@/components/ProductCard";
import { BrandMarquee } from "@/components/BrandMarquee";
import { bestSellers, newArrivals, saleProducts, topLevelCategories } from "@/lib/catalog";
import { getHero } from "@/lib/catalog-api";
import { useCatalog } from "@/lib/catalog-context";
import { HeroCarousel } from "@/components/HeroCarousel";
import { formatPrice } from "@/lib/format";

export const Route = createFileRoute("/")({
  component: Home,
  // Hero posters are managed from the admin, so they are fetched, not compiled in.
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
  const { hero } = Route.useLoaderData();
  const { categories, products, settings } = useCatalog();
  const best = bestSellers(products, 8);
  const news = newArrivals(products, settings.newThisWeek.limit);
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

      {/* HERO — a compact, swipeable offer slider managed from the admin. */}
      {hero.length > 0 && <HeroCarousel slides={hero} />}

      {/* NEW THIS WEEK — curated in Online Store → New this week. When a shop
          has not curated the rail yet, the newest catalogue rows fill it so
          the homepage never launches with an empty feature. */}
      {settings.newThisWeek.enabled && news.length > 0 && (
        <section className="border-b hair bg-surface py-12 md:py-16">
          <div className="container-x">
            <div className="mb-8 flex items-end justify-between gap-6 md:mb-10">
              <div className="max-w-3xl">
                <div className="eyebrow">§ 01 — {settings.newThisWeek.eyebrow}</div>
                <h2 className="mt-3 font-display text-4xl leading-none tracking-tight md:text-6xl">
                  {settings.newThisWeek.title}
                </h2>
                {settings.newThisWeek.subtitle && (
                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-muted md:text-base">
                    {settings.newThisWeek.subtitle}
                  </p>
                )}
              </div>
              <Link to="/shop" className="btn-outline hidden md:inline-flex">
                Shop all <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {news.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CATEGORIES */}
      <section className="py-16 md:py-24">
        <div className="container-x">
          <div className="flex items-end justify-between gap-6 mb-10">
            <div>
              <div className="eyebrow">§ 02 — Categories</div>
              <h2 className="mt-3 font-display text-4xl md:text-6xl leading-none tracking-tight">
                Shop by{" "}
                <span
                  className="italic font-normal"
                  style={{ fontFamily: '"Instrument Serif", serif' }}
                >
                  category
                </span>
              </h2>
            </div>
            <Link
              to="/shop"
              className="hidden md:inline-flex font-mono text-[11px] uppercase tracking-widest hover:bg-accent hover:text-accent-foreground px-2 py-1"
            >
              View all →
            </Link>
          </div>

          {/* Uniform grid — every category carries the same weight. The last
              cell completes the row with a route into the full catalogue.
              Parents only; their sub-categories surface on the parent's page. */}
          <div className="grid gap-4 md:gap-5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {topLevelCategories(categories).map((c, i) => (
              <CategoryTile key={c.slug} category={c} index={i + 1} />
            ))}

            <Link
              to="/shop"
              className="group relative flex flex-col justify-between border hair bg-ink text-primary-foreground p-5 transition-colors hover:bg-accent hover:text-accent-foreground hover:border-accent"
            >
              <span className="font-mono text-[10px] uppercase tracking-widest opacity-70">
                Everything
              </span>
              <span className="mt-8 font-display text-2xl leading-none tracking-tight">
                Shop all
                <br />
                products
              </span>
              <span className="mt-6 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
                Browse catalogue
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* BRAND MARQUEE */}
      <BrandMarquee />

      {/* BESTSELLERS */}
      <section className="py-16 md:py-24 border-b hair">
        <div className="container-x">
          <div className="flex items-end justify-between gap-6 mb-10">
            <div>
              <div className="eyebrow">§ 03 — Bestsellers</div>
              <h2 className="mt-3 font-display text-4xl md:text-6xl leading-none tracking-tight">
                What everyone's
                <br />
                <span className="bg-ink text-primary-foreground px-2 -mx-2 inline-block">
                  clipping.
                </span>
              </h2>
            </div>
            <Link to="/shop" className="btn-outline hidden md:inline-flex">
              All products
            </Link>
          </div>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {best.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>

      {/* DEALS — pricing and schedule come from each online listing; section
          content is managed independently from the admin Deals tab. */}
      {settings.deals.enabled && sale.length > 0 && (
        <section className="border-b hair bg-ink text-primary-foreground">
          <div className="container-x py-16 md:py-24 grid gap-10 lg:grid-cols-[1.4fr_1fr] items-center">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-widest text-accent">
                § 04 — {settings.deals.eyebrow}
              </div>
              <h2 className="mt-4 font-display text-4xl sm:text-5xl md:text-7xl leading-[0.95] md:leading-[0.9] tracking-tight break-words">
                {maxDealPercent > 0 && (
                  <>
                    UP&nbsp;TO
                    <br />
                    <span className="bg-accent text-accent-foreground px-2 -mx-2 inline-block">
                      -{maxDealPercent}% OFF
                    </span>
                    <br />
                  </>
                )}
                {settings.deals.title}
              </h2>
              {settings.deals.subtitle && (
                <p className="mt-6 max-w-md text-sm text-primary-foreground/70">
                  {settings.deals.subtitle}
                </p>
              )}
              <Link
                to="/sale"
                className="mt-8 inline-flex btn-primary bg-accent text-accent-foreground border-accent hover:bg-primary-foreground hover:text-ink hover:border-primary-foreground"
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
                    className="group block border border-primary-foreground/20 bg-surface text-ink"
                  >
                    <div className="relative aspect-square overflow-hidden bg-white p-3">
                      <img
                        src={product.image}
                        alt={product.name}
                        loading="lazy"
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

      {/* EDITORIAL / ABOUT */}
      <section className="border-y hair bg-surface">
        <div className="container-x py-16 md:py-24 grid gap-10 md:grid-cols-[1fr_1fr] items-center">
          <div>
            <div className="eyebrow">§ 05 — The shop</div>
            <h2 className="mt-3 font-display text-4xl md:text-6xl leading-none tracking-tight">
              Independent.
              <br />
              Opinionated.
              <br />
              <span
                className="italic font-normal"
                style={{ fontFamily: '"Instrument Serif", serif' }}
              >
                Human-made.
              </span>
            </h2>
          </div>
          <div className="space-y-6 text-base leading-relaxed">
            <p>
              CliffsOfPuff started with one rule:{" "}
              <strong>only stock what we'd vape ourselves</strong>. No fake batches, no bulk
              unbranded juice, no pushing whatever's cheapest this month.
            </p>
            <p className="text-ink-muted">
              We work directly with OXVA, Voopoo, Vaporesso, Uwell, Geekvape and a handful of
              premium juice houses. Every device is authenticated, every bottle is dated, and every
              order ships the same day it lands.
            </p>
            <div className="grid grid-cols-3 gap-4 pt-4 border-t hair">
              {[
                ["150+", "SKUs"],
                ["10", "Brands"],
                ["24h", "Dispatch"],
              ].map(([n, l]) => (
                <div key={l}>
                  <div className="font-display text-3xl md:text-4xl">{n}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-ink-muted mt-1">
                    {l}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
