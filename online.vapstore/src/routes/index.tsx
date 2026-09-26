import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CategoryTile } from "@/components/CategoryTile";
import { ProductCard } from "@/components/ProductCard";
import {
  bestSellers,
  maxSalePercent,
  saleProducts,
  topLevelCategories,
  type Category,
  type Product,
} from "@/lib/catalog";
import { getHero } from "@/lib/catalog-api";
import { useCatalog } from "@/lib/catalog-context";
import { HeroCarousel } from "@/components/HeroCarousel";
import { formatPrice, truncateProductName } from "@/lib/format";
import { cldHeroDesktopImage, cldHeroMobileImage, cldProductCardImage } from "@/lib/img";

function EventsHeading({
  heading,
  headingImage,
  headingImageAlt,
  align = "center",
  items = [],
}: {
  heading: string;
  /* Artwork shown INSTEAD of the words. Most seasonal headings are a lockup
   * rather than a line of type, and asking the shop to reproduce one as text
   * was always an approximation of what they actually had.
   *
   * `heading` stays required, and is the alt text when this is set — a screen
   * reader still announces the season, and the words show if the file fails. */
  headingImage?: string;
  headingImageAlt?: string;
  align?: "left" | "center" | "right";
  items?: {
    kind: "product" | "category" | "deal";
    title: string;
    image: string;
    imageAlt?: string;
    tag?: string;
    price?: number;
    eventPrice?: number | null;
    /* The offer in one line, already worded. Empty when the card carries no
       offer, or carries one that cannot be put in a line. */
    dealLine?: string;
    href:
      | { to: "/product/$id"; params: { id: string } }
      | { to: "/category/$slug"; params: { slug: string } }
      /* An offer's own page. A deal card always goes here — it is the only
         place that shows everything the offer covers, and an offer is
         satisfied by any mix of that. */
      | { to: "/deal/$id"; params: { id: string } };
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
    <section className="relative overflow-hidden border-b hair bg-background py-6 md:py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-accent" />
      <div className="pointer-events-none absolute -right-16 top-8 h-32 w-32 rounded-full bg-accent/25 blur-3xl" />
      <div className={`container-x flex flex-col ${alignment}`}>
        {headingImage ? (
          /* Capped by HEIGHT, not width, so a wide lockup and a square one
             occupy the same band and the section does not jump about when the
             shop swaps the artwork.

             The cap is about 2.9x what it first shipped at (4/5/6rem), grown
             in three passes as the shop looked at it on the real store. A
             seasonal lockup is the banner for the whole section, and at the
             original size it read as a caption above the cards.

             The three keep their proportions to each other, and are rounded
             to one decimal rather than carrying the exact multiplier out to
             three — a hair of precision nobody can see, on a number somebody
             will have to read. */
          <img
            src={headingImage}
            alt={headingImageAlt || heading}
            className="h-[11.7rem] w-auto max-w-full object-contain sm:h-[14.6rem] md:h-[17.5rem]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <h2
            className="max-w-4xl font-display text-4xl leading-none tracking-tight text-ink sm:text-5xl md:text-6xl"
            style={{ textShadow: "4px 4px 0 var(--color-accent)" }}
          >
            <span className="inline-block">{heading}</span>
          </h2>
        )}
        {items.length > 0 && (
          <div className="mt-6 flex w-full max-w-5xl items-end justify-center overflow-visible px-1 sm:px-0">
            {items.slice(0, 3).map((item, index) => (
              <Link
                key={`${item.kind}-${item.title}-${index}`}
                {...item.href}
                preload="intent"
                className={`event-pick-card group relative w-[8.25rem] shrink-0 origin-bottom overflow-hidden border hair bg-surface p-2 text-left shadow-[0_18px_45px_rgba(0,0,0,0.14)] transition-transform duration-300 hover:z-30 hover:-translate-y-5 hover:rotate-0 sm:w-[16rem] sm:p-3 md:w-[19rem] lg:w-[20rem] ${
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
                      alt={item.imageAlt || item.title}
                      loading="lazy"
                      decoding="async"
                      sizes="(min-width: 768px) 224px, 30vw"
                      className="h-full w-full object-contain p-1 transition-transform duration-500 group-hover:scale-105 sm:p-2"
                    />
                  ) : (
                    /* Deliberately blank. The name is already in the caption
                       below; repeating it large inside the frame reads as a
                       bug rather than as a placeholder. An empty frame reads
                       as a card still waiting for its picture. */
                    <div aria-hidden="true" />
                  )}
                </div>
                <div className="pt-3 sm:pt-4">
                  <div className="font-mono text-[7px] uppercase tracking-widest text-ink-muted sm:text-[9px]">
                    {item.kind}
                  </div>
                  <div
                    className="mt-1 line-clamp-2 font-display text-sm leading-none sm:text-lg"
                    title={item.title}
                  >
                    {item.kind === "product" ? truncateProductName(item.title) : item.title}
                  </div>
                  {/* The price and the offer, on one line.
                   *
                   * The offer used to be nested INSIDE the price, which meant a
                   * card with no price printed no offer either — and a deal
                   * card has no price whenever nothing it covers is sold
                   * online, which is exactly when the offer is all it has to
                   * say. They are siblings now, and either can stand alone.
                   *
                   * A price shows for a product card and for a deal card
                   * alike: an offer reads as an offer only next to the price
                   * it undercuts. A category has no one price, so it shows
                   * none. */}
                  {(typeof item.price === "number" || item.dealLine) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:mt-3 sm:gap-2">
                      {item.kind !== "category" && item.kind !== "deal" && typeof item.price === "number" && (
                        <>
                          <span className="font-display text-base sm:text-xl">
                            {formatPrice(
                              item.eventPrice && item.eventPrice > 0 ? item.eventPrice : item.price,
                            )}
                          </span>
                          {item.eventPrice && item.eventPrice > 0 && item.eventPrice < item.price && (
                            <span className="font-mono text-[9px] text-ink-muted line-through sm:text-xs">
                              {formatPrice(item.price)}
                            </span>
                          )}
                        </>
                      )}
                      {item.dealLine && (
                        <span className="inline-block whitespace-nowrap bg-accent px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-accent-foreground sm:text-[13px]">
                          {item.dealLine}
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

/* The offer in one line, for the card.
 *
 * Written from the same three fields the server's matcher reads, so what the
 * card promises and what the checkout charges come from one description of
 * the offer rather than two.
 *
 * Only a mix offer gets a phrase. A bundle is a recipe of specific products
 * and cannot be put in one line without misdescribing it, and a card that
 * misdescribes an offer is worse than a card that stays quiet. */
function dealLine(deal: {
  name: string;
  mode: "bundle" | "mix";
  groupQuantity: number;
  discountType: "amount" | "percent" | "setPrice";
  discount: number;
} | null | undefined): string {
  if (!deal) return "";
  const need = Math.floor(Number(deal.groupQuantity || 0));
  if (deal.mode !== "mix" || need < 2) return "";

  if (deal.discountType === "setPrice") {
    return `Any ${need} for ${formatPrice(deal.discount)}`;
  }
  if (deal.discountType === "percent") {
    return `Any ${need} — ${deal.discount}% off`;
  }
  return `Any ${need} — ${formatPrice(deal.discount)} off`;
}

function eventDeckItems(
  eventItems: NonNullable<NonNullable<ReturnType<typeof useCatalog>["settings"]["events"]>["items"]>,
  products: Product[],
  categories: Category[],
) {
  return eventItems
    .slice(0, 3)
    /* A card needs a type AND something to point at. Without the type check a
       half-filled card would fall through to the product branch and be looked
       up in the wrong list. */
    /* A card needs a type, and whatever that type points at.

       A DEAL card has no product of its own — that is the point of it — so
       requiring a targetId here is what kept one off the page entirely. It
       qualifies on having an offer instead. */
    .filter((item) =>
      item.enabled === true && item.kind
        ? item.kind === "deal"
          ? Boolean(item.deal)
          : Boolean(item.targetId)
        : false,
    )
    .map((item) => {
      /* The card's own artwork, and ONLY the card's own artwork.

         It used to fall back to the catalogue photograph, which meant a card
         the shop had not styled yet still appeared finished — a product shot
         sitting in a seasonal frame it was never meant for. Left empty the
         card shows its name instead, which reads as a card waiting for its
         picture rather than as a card somebody dressed badly. */
      const cardImage = item.image?.url || "";
      const offer = dealLine(item.deal);
      /* The shop's own wording for this card, falling back to the catalogue
         name. Only the words on the card change — what a click adds to the
         basket is still the product itself. */
      /* What the card is called: the shop's own wording, then the offer's
         name, then the catalogue's.

         The offer comes before the product because a card carrying one is
         about the offer — "any 3 for 18" is the thing being advertised, and
         the product is only where it points. The admin writes this name into
         the field when a deal is picked, so this ordering is what a card
         saved before that existed falls back to. */
      const cardTitle = item.title?.trim() || item.deal?.name?.trim() || "";

      if (item.kind === "deal") {
        const deal = item.deal;
        if (!deal) return null;

        /* Somewhere real to send a shopper who clicks it.

           The offer covers several products and no single one of them is THE
           product, so this takes the first that the website actually sells.
           Without it the card would be a dead end — an offer advertised with
           nowhere to go and buy it. */
        /* Where a click on an offer should land.

           The offer covers several products and no one of them is THE
           product, so this takes the first that the website actually sells.

           A CARD IS NEVER DROPPED FOR WANT OF ONE. Plenty of offers are
           built at the till for stock that is not listed online at all, and
           an earlier version of this returned null in that case — so a card
           the shop had filled in and ticked simply never appeared, with
           nothing anywhere to say why. It goes to the shop page instead. */
        // What one of them costs on its own, so the card can show the price
        // the offer undercuts. Absent when nothing in the offer is sold
        // online — there is no honest number to print then.
        const cheapest = (deal.productIds || [])
          .map((id) => products.find((entry) => entry.productId === id))
          .filter(Boolean)[0] as Product | undefined;

        return {
          kind: "deal" as const,
          title: cardTitle || deal.name,
          image: cardImage,
          imageAlt: item.image?.alt || cardTitle || deal.name || "Event card image",
          dealLine: offer,
          tag: item.tag,
          /* What one of them costs on its own, so the card can show the
             ordinary price beside the offer the way a product card does.
             Absent when nothing in the offer is sold online — there is no
             honest number to print then. */
          price: cheapest?.price,
          /* The offer's own page, ALWAYS — never one of its products.

             An offer is satisfied by any mix of what it covers, so the page
             that lists all of it is the only one a shopper can actually
             complete the offer from. Sending them to whichever product came
             first left them to find the rest themselves, with nothing on
             screen saying what counted. */
          href: { to: "/deal/$id" as const, params: { id: deal.id } },
        };
      }

      if (item.kind === "category") {
        const category = categories.find((entry) => entry.slug === item.targetId);
        if (!category) return null;
        return {
          kind: "category" as const,
          title: cardTitle || category.name,
          image: cardImage,
          imageAlt: item.image?.alt || cardTitle || category.name,
          dealLine: offer,
          tag: item.tag,
          href: { to: "/category/$slug" as const, params: { slug: category.slug } },
        };
      }
      const product = products.find((entry) => entry.listingId === item.targetId);
      if (!product) return null;
        return {
          kind: "product" as const,
          title: cardTitle || product.name,
          image: cardImage,
          imageAlt: item.image?.alt || cardTitle || product.imageAlt || product.name,
          dealLine: offer,
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

/* The banner the visitor is about to see, told to the browser in the <head>.
 *
 * The hero is this page's largest element, and it lives on Cloudinary. Left in
 * the body it is not even discovered until the parser reaches it, by which time
 * the connection has to be opened and the download queued behind every script
 * the head already asked for. Naming it up here moves the request to the front
 * of the page instead of the middle of it.
 *
 * The two entries mirror the <picture> exactly — the same media query, and the
 * same helper building the same URL — so precisely one of them matches any
 * given viewport and the banner is still fetched once. A slide with no separate
 * mobile artwork has only one URL to preload, the same one the <img> carries at
 * every width.
 *
 * This is where fetchPriority="high" belongs: on the element the page is
 * measured by, rather than on the logo in the header. */
const heroPreloadLinks = (slide?: { image?: string; mobileImage?: string }) => {
  if (!slide?.image) return [];

  /* `as const` because the head takes React link attributes, where
   * fetchPriority is "low" | "high" | "auto" rather than a string. In an object
   * literal with no annotation to hold it, "high" widens to string and no
   * longer fits. */
  const desktop = {
    rel: "preload",
    as: "image",
    href: cldHeroDesktopImage(slide.image),
    fetchPriority: "high" as const,
  };

  if (!slide.mobileImage) return [desktop];

  return [
    {
      rel: "preload",
      as: "image",
      href: cldHeroMobileImage(slide.mobileImage),
      media: "(max-width: 767px)",
      fetchPriority: "high" as const,
    },
    { ...desktop, media: "(min-width: 768px)" },
  ];
};

export const Route = createFileRoute("/")({
  component: Home,
  loader: async () => ({ hero: await getHero() }),
  head: ({ loaderData }) => ({
    links: heroPreloadLinks(loaderData?.hero?.[0]),
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
  const maxDealPercent = maxSalePercent(products);

  // The deals headline is owner-editable, so whatever is in settings wins — but
  // a settings record that has never been edited is still carrying an old
  // default, and that is not wording anyone chose. Those are treated as unset so
  // the shop shows the current headline instead of a stale one.
  const LEGACY_DEALS_TITLES = ["Weekly deals.", "Don’t miss out."];
  const dealsTitle = LEGACY_DEALS_TITLES.includes(settings.deals.title)
    ? t("home.dealsTitle")
    : settings.deals.title;

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {hero.length > 0 && <HeroCarousel slides={hero} />}

      {settings.events?.enabled &&
        (settings.events.heading?.trim() || settings.events.headingImage?.url) && (
        <EventsHeading
          heading={settings.events.heading?.trim() || ""}
          headingImage={settings.events.headingImage?.url || undefined}
          headingImageAlt={settings.events.headingImage?.alt || undefined}
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
                {dealsTitle}
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
                      <div
                        className="truncate font-display text-xs leading-tight"
                        title={product.name}
                      >
                        {truncateProductName(product.name)}
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
