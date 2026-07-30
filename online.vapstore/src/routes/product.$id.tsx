import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Minus, Plus, ShieldCheck, Clock, RotateCcw, Check } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { availabilityOf, type Product, type Review, type ReviewSummary } from "@/lib/catalog";
import { getProductPage, getProductReviews } from "@/lib/catalog-api";
import { useCatalog } from "@/lib/catalog-context";
import { Stars } from "@/components/Stars";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/lib/cart";

export const Route = createFileRoute("/product/$id")({
  component: ProductPage,
  // `params.id` is the listing slug. Price and stock come back live, so the
  // page always shows what the shop currently holds.
  loader: async ({
    params,
  }): Promise<{
    product: Product;
    related: Product[];
    reviews: Review[];
    summary: ReviewSummary;
  }> => {
    const [{ product, related }, reviewData] = await Promise.all([
      getProductPage({ data: params.id }),
      getProductReviews({ data: params.id }),
    ]);
    if (!product) throw notFound();
    return { product, related, reviews: reviewData.reviews, summary: reviewData.summary };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.product.name} — CliffsOfPuff` },
          { name: "description", content: loaderData.product.short },
          { property: "og:title", content: loaderData.product.name },
          { property: "og:description", content: loaderData.product.short },
          { property: "og:image", content: loaderData.product.image },
          { property: "og:type", content: "product" },
        ]
      : [],
  }),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-8">
      <div className="text-center">
        <div className="font-display text-4xl">Product not found</div>
        <Link to="/shop" className="mt-6 inline-block btn-primary">
          Back to shop
        </Link>
      </div>
    </div>
  ),
  errorComponent: () => (
    <div className="min-h-screen grid place-items-center p-8">
      <div className="text-center">
        <div className="font-display text-2xl">Something went wrong.</div>
        <p className="mt-2 text-sm text-ink-muted">Please try again later.</p>
        <Link to="/shop" className="mt-6 inline-block btn-primary">
          Back to shop
        </Link>
      </div>
    </div>
  ),
});

function ProductPage() {
  const { product, related, reviews, summary } = Route.useLoaderData() as {
    product: Product;
    related: Product[];
    reviews: Review[];
    summary: ReviewSummary;
  };
  const { settings } = useCatalog();
  const { promises } = settings;
  const { add, listingQty } = useCart();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(
    product.variants.find((variant) => variant.stock > 0)?.productId ||
      product.variants[0]?.productId ||
      product.productId,
  );
  const selectedVariant = product.variants.find(
    (variant) => variant.productId === selectedProductId,
  );
  const activeProductId = selectedVariant?.productId || product.productId;
  const activePrice = selectedVariant?.price ?? product.price;
  const activeStock = selectedVariant?.stock ?? product.stock;
  // Options imported without their own image can often still be matched to one
  // of the product's gallery photos by name (e.g. the "Cola" flavour ↔ a
  // "cuba-cola.webp" gallery image). Display-only and conservative: it fires
  // only when the option has no explicit image and only on an exact
  // name-in-filename match, so it can never show the wrong flavour.
  const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const imageForVariant = (variant: Product["variants"][number]): string => {
    if (variant.image) return variant.image;
    const key = normalizeName(variant.label);
    if (key.length < 4) return "";
    const hit = product.gallery.find((image) =>
      normalizeName(image.url.split("/").pop() || "").includes(key),
    );
    return hit?.url || "";
  };
  const activeImage =
    (selectedVariant ? imageForVariant(selectedVariant) : "") || product.image;
  // A manually clicked thumbnail wins until the shopper changes option; picking a
  // different flavour/colour clears it so that option's own photo shows.
  const [imageOverride, setImageOverride] = useState<string | null>(null);
  const heroImage = imageOverride ?? activeImage;
  // Every distinct picture: the option images sit alongside the gallery so a
  // shopper can click any flavour/colour photo to open it.
  const gallery = [
    activeImage,
    ...product.variants.map((variant) => variant.image),
    ...product.gallery.map((image) => image.url),
  ].filter(
    (url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index,
  );
  // Clicking a photo that belongs to a flavour/colour option should select that
  // option too — so the picture and the option buttons stay in sync both ways
  // (option → picture already worked; this makes picture → option work).
  const selectImage = (image: string) => {
    const variant = product.variants.find((v) => imageForVariant(v) === image);
    if (variant) {
      setSelectedProductId(variant.productId);
      setImageOverride(null); // show the option's own photo
      setQty(1);
    } else {
      setImageOverride(image);
    }
  };
  const onSale = !!product.compareAt;
  const outOfStock = activeStock <= 0;
  const availability = availabilityOf(activeStock);
  const priceUnavailable = activePrice <= 0;
  const unavailable = outOfStock || priceUnavailable;

  // Quantity deal ("buy N+ of any flavour, €X each"). It applies once the
  // combined quantity of this product in the basket — every flavour together,
  // plus the amount about to be added — reaches the threshold.
  const qtyDeal = product.qtyDeal || null;
  const inCartForListing = listingQty(product.listingId);
  const projectedQty = inCartForListing + qty;
  const qtyDealActive = !!qtyDeal && projectedQty >= qtyDeal.minQty;
  const effectiveUnit = qtyDealActive ? qtyDeal!.price : activePrice;
  const qtyDealPct = qtyDeal
    ? Math.round((1 - qtyDeal.price / (qtyDeal.regularPrice || activePrice || 1)) * 100)
    : 0;

  // Options are grouped by kind so flavours and colours appear as separate
  // choice rows, each with its own heading.
  const variantGroups = (["flavour", "colour", "option"] as const)
    .map((kind) => ({
      kind,
      label: kind === "option" ? product.optionLabel || "option" : kind,
      items: product.variants.filter((variant) => (variant.kind || "option") === kind),
    }))
    .filter((group) => group.items.length > 0);

  const lineFor = () => ({
    id: `${product.id}::${activeProductId}`,
    slug: product.id,
    listingId: product.listingId,
    productId: activeProductId,
    variantLabel: selectedVariant?.label,
    name: selectedVariant?.label ? `${product.name} — ${selectedVariant.label}` : product.name,
    brand: product.brand,
    price: activePrice,
    image: activeImage,
    maxStock: activeStock,
    ...(qtyDeal ? { dealMinQty: qtyDeal.minQty, dealPrice: qtyDeal.price } : {}),
  });

  const addToCart = () => {
    if (unavailable) return;
    add(lineFor(), qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1600);
  };

  const buyNow = () => {
    if (unavailable) return;
    add(lineFor(), qty);
    navigate({ to: "/cart" });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="container-x py-4 font-mono text-[11px] uppercase tracking-widest text-ink-muted">
        <Link to="/" className="hover:text-ink">
          Home
        </Link>
        {" / "}
        <Link to="/category/$slug" params={{ slug: product.category }} className="hover:text-ink">
          {product.category.replace("-", " ")}
        </Link>
        {" / "}
        <span className="text-ink truncate">{product.name}</span>
      </div>

      <section className="container-x pb-12 grid gap-8 lg:grid-cols-[1fr_1fr]">
        {/* Gallery */}
        <div className="grid gap-3 lg:sticky lg:top-28 lg:self-start">
          <div className="border hair bg-surface h-[320px] sm:h-[400px] lg:h-[460px] overflow-hidden relative p-4 sm:p-6">
            <img src={heroImage} alt={product.name} className="h-full w-full object-contain" />
            {onSale && (
              <span className="absolute left-0 top-0 bg-[color:var(--sale)] text-primary-foreground font-mono text-[10px] uppercase tracking-widest px-2 py-1">
                -{Math.round((1 - activePrice / (product.compareAt || 1)) * 100)}%
              </span>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {gallery.slice(0, 8).map((image) => (
                <button
                  type="button"
                  key={image}
                  onClick={() => selectImage(image)}
                  aria-label="View this photo"
                  className={`border hair bg-surface aspect-square overflow-hidden p-1.5 transition-opacity hover:opacity-90 ${
                    image === heroImage ? "outline outline-2 outline-ink" : ""
                  }`}
                >
                  <img src={image} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
            {product.brand} · {product.category.replace("-", " ")}
          </div>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl md:text-5xl leading-[1] md:leading-[0.95] tracking-tight break-words">
            {product.name}
          </h1>
          {summary.count > 0 && (
            <a href="#reviews" className="mt-3 inline-flex items-center gap-2 hover:opacity-80">
              <Stars value={summary.average} size={15} />
              <span className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
                {summary.average.toFixed(1)} · {summary.count} review{summary.count > 1 ? "s" : ""}
              </span>
            </a>
          )}
          <p className="mt-4 text-base text-ink-muted">{product.short}</p>

          <div className="mt-8 flex items-baseline gap-4">
            <span className="font-display text-4xl">
              {priceUnavailable ? "Price to be confirmed" : formatPrice(activePrice)}
            </span>
            {onSale && (
              <span className="font-mono text-sm text-ink-muted line-through">
                {formatPrice(product.compareAt!)}
              </span>
            )}
          </div>

          {qtyDeal && !priceUnavailable && (
            <div className="mt-4 flex items-center gap-4 border hair bg-surface p-3">
              {qtyDeal.image ? (
                <img
                  src={qtyDeal.image}
                  alt="Deal"
                  className="h-16 w-16 shrink-0 border hair object-cover"
                />
              ) : (
                <div className="grid h-16 w-16 shrink-0 place-items-center border hair bg-[color:var(--sale)] font-display text-lg text-primary-foreground">
                  {qtyDealPct > 0 ? `-${qtyDealPct}%` : "Deal"}
                </div>
              )}
              <div className="min-w-0">
                <div className="font-display text-sm">
                  Buy {qtyDeal.minQty}+ of any flavour · {formatPrice(qtyDeal.price)} each
                  {qtyDealPct > 0 ? ` · save ${qtyDealPct}%` : ""}
                </div>
                <div className="mt-0.5 font-mono text-[11px] uppercase tracking-widest text-ink-muted">
                  {qtyDealActive
                    ? "Deal applied ✓"
                    : `Add ${qtyDeal.minQty - projectedQty} more (any flavour) to unlock`}
                </div>
              </div>
            </div>
          )}

          {!qtyDeal && product.dealImage && onSale && (
            <div className="mt-4 overflow-hidden border hair bg-surface">
              <img
                src={product.dealImage}
                alt="Deal"
                className="max-h-40 w-full object-contain p-2"
              />
            </div>
          )}

          {variantGroups.length > 0 ? (
            <div className="mt-8 space-y-5">
              {variantGroups.map((group) => (
                <fieldset key={group.kind}>
                  <legend className="eyebrow mb-2">Choose {group.label}</legend>
                  <div className="flex flex-wrap gap-2">
                    {group.items.map((variant) => (
                      <button
                        type="button"
                        key={variant.productId}
                        onClick={() => {
                          setSelectedProductId(variant.productId);
                          setQty(1);
                          setImageOverride(null);
                        }}
                        disabled={variant.stock <= 0}
                        className={`border hair px-3 py-2 font-display text-sm transition-colors ${
                          variant.productId === activeProductId
                            ? "bg-ink text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        } disabled:cursor-not-allowed disabled:opacity-40`}
                      >
                        {variant.label}
                        {variant.stock <= 0 ? " · sold out" : ""}
                      </button>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          ) : product.flavor ? (
            <div className="mt-8">
              <div className="eyebrow mb-2">Flavour</div>
              <div className="inline-block border hair px-3 py-1.5 font-display text-sm">
                {product.flavor}
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex items-stretch gap-3">
            <div className="flex items-center border hair">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="p-3 hover:bg-accent hover:text-accent-foreground"
                aria-label="Decrease"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center font-display">{qty}</span>
              <button
                onClick={() => setQty(Math.min(activeStock, qty + 1))}
                className="p-3 hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
                aria-label="Increase"
                disabled={qty >= activeStock}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={addToCart}
              disabled={unavailable}
              className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {added ? (
                <>
                  <Check className="h-4 w-4" /> Added to cart
                </>
              ) : unavailable ? (
                priceUnavailable ? (
                  "Price unavailable"
                ) : (
                  "Out of stock"
                )
              ) : (
                <>Add to cart · {formatPrice(effectiveUnit * qty)}</>
              )}
            </button>
          </div>

          <button
            onClick={buyNow}
            disabled={unavailable}
            className="mt-3 btn-outline w-full disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Buy now
          </button>

          <div className="mt-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">
            {priceUnavailable
              ? "Visible in catalogue · contact the shop for price"
              : outOfStock
                ? "Currently unavailable"
                : `${availability.label} · ${promises.dispatch}`}
          </div>

          <div className="mt-8 grid grid-cols-3 gap-3 border-y hair py-6">
            {[
              { icon: Clock, label: promises.dispatch },
              ...(promises.authentic
                ? [{ icon: ShieldCheck, label: promises.authenticLabel }]
                : []),
              { icon: RotateCcw, label: `${promises.returnsDays}-day returns` },
            ].map((v, i) => (
              <div key={i} className="flex items-start gap-2">
                <v.icon className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="font-mono text-[10px] uppercase tracking-widest">{v.label}</div>
              </div>
            ))}
          </div>

          {/* Specs */}
          <div className="mt-8">
            <div className="eyebrow mb-3">Specifications</div>
            <dl className="divide-y hair border-y hair">
              {Object.entries(product.specs)
                .filter(([k]) => {
                  // Hide developer/internal specs — shoppers only need the
                  // availability line below, not our catalogue id or raw counts.
                  const key = k.toLowerCase();
                  return (
                    !key.includes("catalogue") &&
                    !key.includes("source") &&
                    !key.includes("stock")
                  );
                })
                .map(([k, v]) => (
                <div
                  key={k}
                  className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-4 py-3"
                >
                  <dt className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
                    {k}
                  </dt>
                  <dd className="text-sm">{v}</dd>
                </div>
              ))}
              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-4 py-3">
                <dt className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
                  Availability
                </dt>
                <dd className="text-sm">{availability.label}</dd>
              </div>
            </dl>
          </div>

          {/* Description */}
          <div className="mt-8">
            <div className="eyebrow mb-3">About this product</div>
            <p className="text-base leading-relaxed text-ink-muted">{product.description}</p>
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section id="reviews" className="border-t hair py-12 scroll-mt-24">
        <div className="container-x">
          <h2 className="font-display text-3xl md:text-5xl leading-none tracking-tight mb-8">
            Reviews.
          </h2>
          {summary.count === 0 ? (
            <p className="text-ink-muted">
              No reviews yet. Verified reviews from customers appear here after
              their order is delivered.
            </p>
          ) : (
            <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
              {/* Summary */}
              <div className="lg:sticky lg:top-24 h-fit">
                <div className="font-display text-6xl leading-none">
                  {summary.average.toFixed(1)}
                </div>
                <Stars value={summary.average} size={18} className="mt-2" />
                <div className="mt-2 font-mono text-[11px] uppercase tracking-widest text-ink-muted">
                  {summary.count} verified review{summary.count > 1 ? "s" : ""}
                </div>
                <div className="mt-5 space-y-1.5">
                  {[5, 4, 3, 2, 1].map((n) => {
                    const c = summary.breakdown[n] || 0;
                    const pct = summary.count ? (c / summary.count) * 100 : 0;
                    return (
                      <div key={n} className="flex items-center gap-2 text-[11px]">
                        <span className="w-3 font-mono text-ink-muted">{n}</span>
                        <div className="h-1.5 flex-1 bg-ink/10">
                          <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-6 text-right font-mono tabular-nums text-ink-muted">
                          {c}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* List */}
              <div className="divide-y hair border-y hair">
                {reviews.map((r) => (
                  <article key={r.id} className="py-6">
                    <div className="flex items-center gap-3">
                      <Stars value={r.rating} size={14} />
                      {r.verified && (
                        <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-widest text-emerald-600">
                          <Check className="h-3 w-3" /> Verified Purchase
                        </span>
                      )}
                    </div>
                    {r.title && <div className="mt-2 font-display text-lg">{r.title}</div>}
                    {r.body && (
                      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{r.body}</p>
                    )}
                    <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                      {r.name} · {new Date(r.createdAt).toLocaleDateString()}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Related */}
      <section className="border-t hair py-12">
        <div className="container-x">
          <h2 className="font-display text-3xl md:text-5xl leading-none tracking-tight mb-8">
            You may also like.
          </h2>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
