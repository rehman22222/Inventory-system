import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2, ShieldCheck, Truck, Lock } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useCart } from "@/lib/cart";
import { useCatalog } from "@/lib/catalog-context";
import { formatPrice } from "@/lib/format";

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
  const { lines, subtotal, count, setQty, remove, ready } = useCart();
  const { settings } = useCatalog();
  const { flatRate, freeThreshold } = settings.shipping;

  // Render nothing cart-specific until hydrated, to avoid a flash of the empty
  // state on a page the customer loaded with items already in storage.
  const empty = ready && lines.length === 0;
  const shipping = subtotal >= freeThreshold || subtotal === 0 ? 0 : flatRate;
  const total = subtotal + shipping;
  const toFreeShipping = Math.max(0, freeThreshold - subtotal);

  if (empty) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <section className="container-x py-16 md:py-24 max-w-2xl">
          <div className="eyebrow">Cart</div>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl md:text-7xl leading-[0.95] md:leading-none tracking-tight break-words">
            Empty for now.
          </h1>
          <p className="mt-6 text-ink-muted">
            Your cart is waiting. Add a device, a bottle of juice, or a couple of disposables to get
            started.
          </p>
          <Link to="/shop" className="mt-8 inline-flex btn-primary">
            Start shopping
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
        <div className="eyebrow">Cart</div>
        <h1 className="mt-3 font-display text-4xl md:text-6xl leading-none tracking-tight">
          Your cart{" "}
          {ready && (
            <span className="text-ink-muted">
              · {count} item{count === 1 ? "" : "s"}
            </span>
          )}
        </h1>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-14">
          {/* Lines */}
          <div className="border-y hair">
            {lines.map((l) => (
              <div
                key={l.id}
                className="grid grid-cols-[72px_1fr] sm:grid-cols-[88px_1fr_auto] gap-x-4 gap-y-3 py-5 border-b hair last:border-b-0"
              >
                <Link
                  to="/product/$id"
                  params={{ id: l.slug }}
                  className="border hair bg-surface aspect-square overflow-hidden"
                >
                  <img src={l.image} alt={l.name} className="h-full w-full object-cover" />
                </Link>

                <div className="min-w-0">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                    {l.brand}
                  </div>
                  <Link
                    to="/product/$id"
                    params={{ id: l.slug }}
                    className="font-display text-sm leading-tight tracking-tight hover:bg-accent hover:text-accent-foreground line-clamp-2"
                  >
                    {l.name}
                  </Link>
                  <div className="mt-2 font-display text-sm">{formatPrice(l.price)}</div>

                  {/* Qty + remove */}
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex items-center border hair">
                      <button
                        onClick={() => setQty(l.id, l.qty - 1)}
                        className="p-1.5 hover:bg-accent hover:text-accent-foreground"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-9 text-center font-display text-sm tnum">{l.qty}</span>
                      <button
                        onClick={() => setQty(l.id, l.qty + 1)}
                        disabled={l.qty >= l.maxStock}
                        className="p-1.5 hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button
                      onClick={() => remove(l.id)}
                      className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-muted hover:text-[color:var(--sale)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                    {l.qty >= l.maxStock && (
                      <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                        Max stock
                      </span>
                    )}
                  </div>
                </div>

                {/* Line total drops onto its own full-width row on phones so
                    the product name never gets squeezed. */}
                <div className="col-span-2 flex items-baseline justify-between border-t hair pt-3 sm:col-span-1 sm:block sm:border-0 sm:pt-0 sm:text-right">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted sm:hidden">
                    Line total
                  </span>
                  <span className="font-display text-base tnum whitespace-nowrap">
                    {formatPrice(l.price * l.qty)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <aside className="lg:sticky lg:top-32 self-start">
            <div className="border hair p-6">
              <div className="eyebrow">Order summary</div>

              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Subtotal</dt>
                  <dd className="font-display tnum">{formatPrice(subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-muted">Shipping</dt>
                  <dd className="font-display tnum">
                    {shipping === 0 ? "Free" : formatPrice(shipping)}
                  </dd>
                </div>
                <div className="flex justify-between border-t hair pt-3 text-base">
                  <dt className="font-display">Total</dt>
                  <dd className="font-display tnum">{formatPrice(total)}</dd>
                </div>
              </dl>

              {toFreeShipping > 0 && (
                <div className="mt-4 border hair bg-surface p-3 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                  Add {formatPrice(toFreeShipping)} for free shipping
                </div>
              )}

              <Link to="/checkout" className="mt-5 btn-primary w-full">
                <Lock className="h-4 w-4" /> Continue to checkout
              </Link>
              <p className="mt-3 text-center font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                Stock is reserved when your order is placed
              </p>

              <Link
                to="/shop"
                className="mt-4 block text-center font-mono text-[11px] uppercase tracking-widest hover:bg-accent hover:text-accent-foreground py-1"
              >
                ← Continue shopping
              </Link>
            </div>

            {/* Reassurance */}
            <div className="mt-4 grid gap-3">
              {[
                { icon: Truck, label: "Same-day dispatch before 5 PM" },
                { icon: ShieldCheck, label: "100% authentic, sealed products" },
                { icon: Lock, label: "Inventory checked before confirmation" },
              ].map((v, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-widest text-ink-muted"
                >
                  <v.icon className="h-3.5 w-3.5 shrink-0" /> {v.label}
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
