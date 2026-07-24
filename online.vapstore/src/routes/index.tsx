import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CategoryTile } from "@/components/CategoryTile";
import { ProductCard } from "@/components/ProductCard";
import { BrandMarquee } from "@/components/BrandMarquee";
import { bestSellers, newArrivals, saleProducts } from "@/lib/catalog";
import { getHero } from "@/lib/catalog-api";
import { useCatalog } from "@/lib/catalog-context";
import { HeroCarousel } from "@/components/HeroCarousel";

export const Route = createFileRoute("/")({
  component: Home,
  // Hero posters are managed from the admin, so they are fetched, not compiled in.
  loader: async () => ({ hero: await getHero() }),
  head: () => ({
    meta: [
      { title: "ClipsOfPuff — Premium Vapes, Pods & E-Liquid" },
      {
        name: "description",
        content:
          "ClipsOfPuff is an independent vape store. Shop pod kits, mods, disposables, nic salts and freebase e-liquid from OXVA, Voopoo, Vaporesso, Uwell and more.",
      },
      { property: "og:title", content: "ClipsOfPuff — Premium Vape Store" },
      {
        property: "og:description",
        content: "Pod kits, mods, disposables and premium e-liquid. Same-day dispatch nationwide.",
      },
    ],
  }),
});

function Home() {
  const { hero } = Route.useLoaderData();
  const { categories, products } = useCatalog();
  const best = bestSellers(products, 8);
  const news = newArrivals(products, 8);
  const sale = saleProducts(products).slice(0, 4);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* HERO — auto-sliding, swipeable offer slider. The trust row and the
          category rail live inside it. Edit slides in src/data/promos.ts. */}
      {hero.length > 0 && <HeroCarousel slides={hero} />}

      {/* CATEGORIES */}
      <section className="py-16 md:py-24">
        <div className="container-x">
          <div className="flex items-end justify-between gap-6 mb-10">
            <div>
              <div className="eyebrow">§ 01 — Categories</div>
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
              cell completes the row with a route into the full catalogue. */}
          <div className="grid gap-4 md:gap-5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {categories.map((c, i) => (
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
              <div className="eyebrow">§ 02 — Bestsellers</div>
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

      {/* SALE BANNER */}
      <section className="border-b hair bg-ink text-primary-foreground">
        <div className="container-x py-16 md:py-24 grid gap-10 lg:grid-cols-[1.4fr_1fr] items-center">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-accent">
              § 03 — Live Sale
            </div>
            <h2 className="mt-4 font-display text-4xl sm:text-5xl md:text-8xl leading-[0.95] md:leading-[0.9] tracking-tight break-words">
              UP&nbsp;TO
              <br />
              <span className="bg-accent text-accent-foreground px-2 -mx-2 inline-block">
                -40% OFF
              </span>
              <br />
              Disposables&nbsp;&amp;
              <br />
              nic&nbsp;salts.
            </h2>
            <p className="mt-6 max-w-md text-sm text-primary-foreground/70">
              Weekly rotating deals on the flavours you actually vape. Stock is limited — once it's
              gone, it's gone.
            </p>
            <Link
              to="/sale"
              className="mt-8 inline-flex btn-primary bg-accent text-accent-foreground border-accent hover:bg-primary-foreground hover:text-ink hover:border-primary-foreground"
            >
              See the deals <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {sale.map((p) => (
              <Link
                key={p.id}
                to="/product/$id"
                params={{ id: p.id }}
                className="border border-primary-foreground/20 bg-surface text-ink block"
              >
                <img
                  src={p.image}
                  alt={p.name}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
                <div className="p-3">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-ink-muted">
                    {p.brand}
                  </div>
                  <div className="font-display text-xs leading-tight truncate">{p.name}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* NEW ARRIVALS */}
      <section className="py-16 md:py-24">
        <div className="container-x">
          <div className="flex items-end justify-between gap-6 mb-10">
            <div>
              <div className="eyebrow">§ 04 — Fresh drops</div>
              <h2 className="mt-3 font-display text-4xl md:text-6xl leading-none tracking-tight">
                New this week.
              </h2>
            </div>
          </div>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {news.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>

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
              ClipsOfPuff started with one rule:{" "}
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
