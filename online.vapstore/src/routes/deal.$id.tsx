import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { useCatalog } from "@/lib/catalog-context";
import { formatPrice } from "@/lib/format";
import { StorefrontNotFound } from "@/components/StorefrontNotFound";

/* Everything one offer covers, on one page.
 *
 * A "any 3 for 18" offer is satisfied by any MIX of the products in it, so the
 * one thing a shopper needs is to see all of them together and add three. An
 * events card used to send them to whichever product happened to be first in
 * the offer, which is the one place they cannot do that from — they would have
 * to find the other two themselves, with nothing telling them what counts.
 *
 * Built entirely from what the page already has. The offer's terms and the
 * products it covers both travel with the storefront settings, so this needs no
 * request of its own: nothing to load, nothing to wait for, nothing to go
 * stale separately from the rest of the page.
 *
 * Only offers the shop has put on an events card are reachable here. That is
 * the same rule the checkout prices by — an offer that is not on a card is not
 * on the website — so a page cannot advertise terms the till would refuse.
 */
export const Route = createFileRoute("/deal/$id")({
  component: DealPage,
});

function DealPage() {
  const { id } = Route.useParams();
  const { products, settings } = useCatalog();

  const offer = useMemo(() => {
    const card = (settings.events?.items || []).find(
      (item) => item?.enabled && item.kind === "deal" && item.deal?.id === id,
    );
    if (!card?.deal) return null;

    const covered = (card.deal.productIds || [])
      .map((productId) => products.find((entry) => entry.productId === productId))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    return { card, deal: card.deal, covered };
  }, [id, products, settings]);

  if (!offer) {
    return (
      <StorefrontNotFound
        eyebrow="Offer not found"
        title="That offer has finished."
        message="It may have ended or been taken down. Browse the store for what is on now."
      />
    );
  }

  const { card, deal, covered } = offer;
  const need = Math.floor(Number(deal.groupQuantity || 0));

  /* The terms, in the shop's own words where it has given any.
   *
   * The card's wording wins, then the offer's name — the same order the card
   * itself uses, so a shopper who clicked "Halloween 3 for 18" does not land on
   * a page headed something else. */
  const heading = card.title?.trim() || deal.name;
  const terms =
    deal.mode === "mix" && need >= 2
      ? deal.discountType === "setPrice"
        ? `Any ${need} for ${formatPrice(deal.discount)}`
        : deal.discountType === "percent"
          ? `Any ${need} — ${deal.discount}% off`
          : `Any ${need} — ${formatPrice(deal.discount)} off`
      : "";

  return (
    <div className="min-h-screen bg-background">
      <title>{`${heading} - Cliffs of Puff`}</title>
      <Header />

      <section className="border-b hair bg-surface py-8 md:py-12">
        <div className="container-x">
          <div className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
            Offer
          </div>
          <h1 className="mt-2 font-display text-3xl leading-none tracking-tight text-ink sm:text-4xl md:text-5xl">
            {heading}
          </h1>
          {terms && (
            <div className="mt-3 inline-block bg-accent px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wide text-accent-foreground">
              {terms}
            </div>
          )}
          {need >= 2 && (
            <p className="mt-3 max-w-2xl text-sm text-ink-muted">
              Mix them however you like — {need} of one, or a few of each. The
              offer comes off at checkout once {need} are in your basket.
            </p>
          )}
        </div>
      </section>

      <section className="py-8 md:py-12">
        <div className="container-x">
          {covered.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {covered.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            /* The offer is real and the shop is advertising it, but nothing it
               covers is on sale here — every product in it is till-only stock.
               Saying so plainly beats an empty grid that reads as a broken
               page. */
            <p className="text-sm text-ink-muted">
              The products in this offer are not available to buy online at the
              moment. They are in the shop.
            </p>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
