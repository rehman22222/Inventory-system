import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Minus, Plus, Trash2, ShieldCheck, Clock, Lock } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCart } from "@/lib/cart";
import { useCatalog } from "@/lib/catalog-context";
import { formatPrice } from "@/lib/format";
import { cldProductThumbImage } from "@/lib/img";

export const Route = createFileRoute("/cart")({
  component: Cart,
  head: () => ({
    meta: [
      { title: "Cart — CliffsOfPuff" },
      { name: "description", content: "Your CliffsOfPuff cart." },
    ],
  }),
});

function Cart() {
  const { t } = useTranslation();
  const { lines, subtotal, count, setQty, remove, ready, unitPriceFor, listingQty } = useCart();
  const { settings } = useCatalog();
  const { flatRate, freeThreshold } = settings.shipping;

  const empty = ready && lines.length === 0;
  const shipping = subtotal >= freeThreshold || subtotal === 0 ? 0 : flatRate;
  const total = subtotal + shipping;
  const toFreeShipping = Math.max(0, freeThreshold - subtotal);

  if (empty) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <section className="container-x max-w-2xl py-16 md:py-24">
          <div className="eyebrow">{t("cart.title")}</div>
          <h1 className="mt-3 break-words font-display text-4xl leading-[0.95] tracking-tight sm:text-5xl md:text-7xl md:leading-none">
            {t("cart.emptyTitle")}
          </h1>
          <p className="mt-6 text-ink-muted">{t("cart.emptyCopy")}</p>
          <Link to="/shop" className="btn-primary mt-8 inline-flex">
            {t("cart.startShopping")}
          </Link>
        </section>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <section className="container-x py-10 md:py-16">
        <div className="eyebrow">{t("cart.title")}</div>
        <h1 className="mt-3 font-display text-4xl leading-none tracking-tight md:text-6xl">
          {t("cart.yourCart")}{" "}
          {ready && (
            <span className="text-ink-muted">
              · {count} {count === 1 ? t("cart.item") : t("cart.items")}
            </span>
          )}
        </h1>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-14">
          <div className="border-y hair">
            {lines.map((line) => (
              <div
                key={line.id}
                className="grid grid-cols-[72px_1fr] gap-x-4 gap-y-3 border-b hair py-5 last:border-b-0 sm:grid-cols-[88px_1fr_auto]"
              >
                <Link
                  to="/product/$id"
                  params={{ id: line.slug }}
                  className="aspect-square overflow-hidden border hair bg-white p-1.5"
                >
                  <img
                    src={cldProductThumbImage(line.image)}
                    alt={line.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain"
                  />
                </Link>

                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                    {line.brand}
                  </div>
                  <Link
                    to="/product/$id"
                    params={{ id: line.slug }}
                    className="line-clamp-2 font-display text-sm leading-tight tracking-tight hover:bg-accent hover:text-accent-foreground"
                  >
                    {line.name}
                  </Link>
                  <div className="mt-2 flex items-baseline gap-2 font-display text-sm">
                    <span
                      className={unitPriceFor(line) < line.price ? "text-[color:var(--sale)]" : ""}
                    >
                      {formatPrice(unitPriceFor(line))}
                    </span>
                    {unitPriceFor(line) < line.price && (
                      <span className="font-mono text-[11px] text-ink-muted line-through">
                        {formatPrice(line.price)}
                      </span>
                    )}
                  </div>
                  {line.dealMinQty &&
                    line.dealPrice &&
                    listingQty(line.listingId) < line.dealMinQty && (
                      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-[color:var(--sale)]">
                        {t("cart.buyDeal", {
                          min: line.dealMinQty,
                          price: formatPrice(line.dealPrice),
                          count: line.dealMinQty - listingQty(line.listingId),
                        })}
                      </div>
                    )}

                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex items-center border hair">
                      <button
                        onClick={() => setQty(line.id, line.qty - 1)}
                        className="p-1.5 hover:bg-accent hover:text-accent-foreground"
                        aria-label={t("cart.decreaseQty")}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="tnum w-9 text-center font-display text-sm">{line.qty}</span>
                      <button
                        onClick={() => setQty(line.id, line.qty + 1)}
                        disabled={line.qty >= line.maxStock}
                        className="p-1.5 hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
                        aria-label={t("cart.increaseQty")}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => remove(line.id)}
                      className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-muted hover:text-[color:var(--sale)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("cart.remove")}
                    </button>
                    {line.qty >= line.maxStock && (
                      <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                        {t("cart.maxStock")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="col-span-2 flex items-baseline justify-between border-t hair pt-3 sm:col-span-1 sm:block sm:border-0 sm:pt-0 sm:text-right">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted sm:hidden">
                    {t("cart.lineTotal")}
                  </span>
                  <span className="tnum whitespace-nowrap font-display text-base">
                    {formatPrice(unitPriceFor(line) * line.qty)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <aside className="self-start lg:sticky lg:top-32">
            <div className="border hair p-6">
              <div className="eyebrow">{t("cart.orderSummary")}</div>

              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">{t("cart.subtotal")}</dt>
                  <dd className="tnum font-display">{formatPrice(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">{t("cart.shipping")}</dt>
                  <dd className="tnum font-display">
                    {shipping === 0 ? t("cart.free") : formatPrice(shipping)}
                  </dd>
                </div>
                <div className="flex justify-between border-t hair pt-3 text-base">
                  <dt className="font-display">{t("cart.total")}</dt>
                  <dd className="tnum font-display">{formatPrice(total)}</dd>
                </div>
              </dl>

              {toFreeShipping > 0 && (
                <div className="mt-4 border hair bg-surface p-3 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                  {t("cart.addForFreeShipping", { amount: formatPrice(toFreeShipping) })}
                </div>
              )}

              <Link to="/checkout" className="btn-primary mt-5 w-full">
                <Lock className="h-4 w-4" /> {t("cart.checkout")}
              </Link>
              <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                {t("cart.stockReserved")}
              </p>

              <Link
                to="/shop"
                className="mt-4 block py-1 text-center font-mono text-[11px] uppercase tracking-widest hover:bg-accent hover:text-accent-foreground"
              >
                {t("cart.continueShopping")}
              </Link>
            </div>

            <div className="mt-4 grid gap-3">
              {[
                {
                  icon: Clock,
                  label: t("cart.dispatchPromise", { dispatch: settings.promises.dispatch }),
                },
                { icon: ShieldCheck, label: t("cart.authenticPromise") },
                { icon: Lock, label: t("cart.inventoryPromise") },
              ].map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-widest text-ink-muted"
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" /> {item.label}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <Footer />
    </div>
  );
}
