import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CategoryTile } from "@/components/CategoryTile";
import { ProductCard } from "@/components/ProductCard";
import {
  bestSellers,
  saleProducts,
  topLevelCategories,
  type Category,
  type Product,
} from "@/lib/catalog";
import { getHero } from "@/lib/catalog-api";
import { useCatalog } from "@/lib/catalog-context";
import { HeroCarousel } from "@/components/HeroCarousel";
import { formatPrice } from "@/lib/format";
import { cldProductCardImage } from "@/lib/img";

function EventsHeading({
  heading,
  align = "center",
  items = [],
}: {
  heading: string;
  align?: "left" | "center" | "right";
  items?: {
    kind: "product" | "category";
    title: string;
    image: string;
    tag?: string;
    price?: number;
    eventPrice?: number | null;
    href:
      | { to: "/product/$id"; params: { id: string } }
      | { to: "/category/$slug"; params: { slug: string } };
  }[];
}) {
  const alignment =
    align === "left" ? "items-start text-left" : align === "right" ? "items-end text-right" : "items-center text-center";
  const fanClasses = [
    "z-10 -rotate-6",
    "z-20 -ml-10 -translate-y-2 -rotate-1 sm:-ml-4 sm:translate-y-4 sm:rotate-0",
    "z-10 -ml-10 rotate-6 sm:-ml-4",
  ];

  return (
    <section className="relative overflow-hidden border-b hair bg-background py-12 md:py-16">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-accent" />
      <div className="pointer-events-none absolute -right-16 top-8 h-32 w-32 rounded-full bg-accent/25 blur-3xl" />
      <div className={`container-x flex flex-col ${alignment}`}>
        <h2
          className="max-w-4xl font-display text-4xl leading-none tracking-tight text-ink sm:text-5xl md:text-6xl"
          style={{ textShadow: "4px 4px 0 var(--color-accent)" }}
        >
          <span className="inline-block">{heading}</span>
        </h2>
        {items.length > 0 && (
          <div className="mt-10 flex w-full max-w-5xl items-end justify-center overflow-visible px-1 sm:px-0">
            {items.slice(0, 3).map((item, index) => (
              <Link
                key={`${item.kind}-${item.title}-${index}`}
                {...item.href}
                preload="intent"
                className={`event-pick-card group relative w-[8.25rem] shrink-0 origin-bottom overflow-hidden border hair bg-surface p-2.5 text-left shadow-[0_18px_45px_rgba(0,0,0,0.14)] transition-transform duration-300 hover:z-30 hover:-translate-y-5 hover:rotate-0 sm:w-[14rem] sm:p-4 md:w-[16rem] lg:w-[17rem] ${
                  fanClasses[index] || "rotate-0"
                }`}
              >
                {item.tag && (
                  <div className="absolute left-3 top-3 z-10 rounded-full bg-sale px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-white shadow-lg">
                    {item.tag}
                  </div>
                )}
                <div className="grid aspect-[4/5] place-items-center overflow-hidden bg-white">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.title}
                      loading="lazy"
                      decoding="async"
                      sizes="(min-width: 768px) 224px, 30vw"
                      className="h-full w-full object-contain p-2 transition-transform duration-500 group-hover:scale-105 sm:p-3"
                    />
                  ) : (
                    <div className="p-4 text-center font-display text-2xl leading-none text-ink">
                      {item.title}
                    </div>
                  )}
                </div>
                <div className="pt-3 sm:pt-4">
                  <div className="font-mono text-[7px] uppercase tracking-widest text-ink-muted sm:text-[9px]">
                    {item.kind}
                  </div>
                  <div className="mt-1 line-clamp-2 font-display text-sm leading-none sm:text-lg">
                    {item.title}
                  </div>
                  {item.kind === "product" && typeof item.price === "number" && (
                    <div className="mt-2 flex items-center gap-1.5 sm:mt-3 sm:gap-2">
                      <span className="font-display text-base sm:text-xl">
                        {formatPrice(item.eventPrice && item.eventPrice > 0 ? item.eventPrice : item.price)}
                      </span>
                      {item.eventPrice && item.eventPrice > 0 && item.eventPrice < item.price && (
                        <span className="font-mono text-[9px] text-ink-muted line-through sm:text-xs">
                          {formatPrice(item.price)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function eventDeckItems(
  eventItems: NonNullable<NonNullable<ReturnType<typeof useCatalog>["settings"]["events"]>["items"]>,
  products: Product[],
  categories: Category[],
) {
  return eventItems
    .slice(0, 3)
    .filter((item) => item.enabled === true && item.targetId)
    .map((item) => {
      if (item.kind === "category") {
        const category = categories.find((entry) => entry.slug === item.targetId);
        if (!category) return null;
        return {
          kind: "category" as const,
          title: category.name,
          image: category.image,
          tag: item.tag,
          href: { to: "/category/$slug" as const, params: { slug: category.slug } },
        };
      }
      const product = products.find((entry) => entry.listingId === item.targetId);
      if (!product) return null;
        return {
          kind: "product" as const,
          title: product.name,
          image: product.image,
          tag: item.tag,
          price: product.price,
          eventPrice: item.eventPrice ?? null,
          href: {
            to: "/product/$id" as const,
            params: { id: product.id },
          },
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export const Route = createFileRoute("/")({
  component: Home,
  loader: async () => ({ hero: await getHero() }),
  head: () => ({
    meta: [
      { title: "Cliffs of Puff — Premium Vapes, Pods & E-Liquid" },
      {
        name: "description",
        content:
          "Cliffs of Puff is an independent vape store. Shop pod kits, mods, disposables, nic salts and freebase e-liquid from OXVA, Voopoo, Vaporesso, Uwell and more.",
      },
      { property: "og:title", content: "Cliffs of Puff — Premium Vape Store" },
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
  const best = bestSellers(products, settings.bestSellers?.limit || 8);
  const sale = saleProducts(products).slice(0, settings.deals.limit);
  const eventItems = eventDeckItems(settings.events?.items || [], products, categories);
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

      {settings.events?.enabled && settings.events.heading?.trim() && (
        <EventsHeading
          heading={settings.events.heading.trim()}
          align={settings.events.align || "center"}
          items={eventItems}
        />
      )}

      {settings.bestSellers?.enabled !== false && best.length > 0 && (
        <section id="best-sellers" className="border-b hair py-16 md:py-24">
          <div className="container-x">
            <div className="mb-10 flex items-end justify-between gap-6">
              <div>
                <h2 className="font-display text-4xl leading-none tracking-tight md:text-6xl">
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
      )}

      {settings.deals.enabled && sale.length > 0 && (
        <section className="border-b hair bg-ink text-primary-foreground">
          <div className="container-x grid items-center gap-10 py-16 md:py-24 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="break-words font-display text-4xl leading-[0.95] tracking-tight sm:text-5xl md:text-7xl md:leading-[0.9]">
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
              <h2 className="font-display text-4xl leading-none tracking-tight md:text-6xl">
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
