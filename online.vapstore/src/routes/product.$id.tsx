import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Minus, Plus, ShieldCheck, Truck, RotateCcw, Check } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/lib/catalog";
import { getProductPage } from "@/lib/catalog-api";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/lib/cart";

export const Route = createFileRoute("/product/$id")({
  component: ProductPage,
  // `params.id` is the listing slug. Price and stock come back live, so the
  // page always shows what the shop currently holds.
  loader: async ({ params }): Promise<{ product: Product; related: Product[] }> => {
    const { product, related } = await getProductPage({ data: params.id });
    if (!product) throw notFound();
    return { product, related };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.product.name} — ClipsOfPuff` },
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
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-8">
      <div className="font-display text-2xl">{error.message}</div>
    </div>
  ),
});

function ProductPage() {
  const { product, related } = Route.useLoaderData() as { product: Product; related: Product[] };
  const { add } = useCart();
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
  const activeImage = selectedVariant?.image || product.image;
  const gallery = [activeImage, ...product.gallery.map((image) => image.url)].filter(
    (url, index, urls) => Boolean(url) && urls.indexOf(url) === index,
  );
  const onSale = !!product.compareAt;
  const outOfStock = activeStock <= 0;
  const priceUnavailable = activePrice <= 0;
  const unavailable = outOfStock || priceUnavailable;

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

      <section className="container-x pb-16 grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        {/* Gallery */}
        <div className="grid gap-3">
          <div className="border hair bg-surface aspect-square overflow-hidden relative">
            <img src={activeImage} alt={product.name} className="h-full w-full object-cover" />
            {onSale && (
              <span className="absolute left-0 top-0 bg-[color:var(--sale)] text-primary-foreground font-mono text-[10px] uppercase tracking-widest px-2 py-1">
                -{Math.round((1 - activePrice / (product.compareAt || 1)) * 100)}%
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-3">
            {gallery.slice(0, 4).map((image, i) => (
              <div
                key={image}
                className={`border hair bg-surface aspect-square overflow-hidden ${i === 0 ? "outline outline-2 outline-ink" : ""}`}
              >
                <img src={image} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>
        </div>

        {/* Details */}
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
            {product.brand} · {product.category.replace("-", " ")}
          </div>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl md:text-5xl leading-[1] md:leading-[0.95] tracking-tight break-words">
            {product.name}
          </h1>
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

          {product.variants.length > 0 ? (
            <fieldset className="mt-8">
              <legend className="eyebrow mb-2">Choose {product.optionLabel || "option"}</legend>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((variant) => (
                  <button
                    type="button"
                    key={variant.productId}
                    onClick={() => {
                      setSelectedProductId(variant.productId);
                      setQty(1);
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
                <>Add to cart · {formatPrice(activePrice * qty)}</>
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
                : `${activeStock} in stock · ships today`}
          </div>

          <div className="mt-8 grid grid-cols-3 gap-3 border-y hair py-6">
            {[
              { icon: Truck, label: "Same-day dispatch" },
              { icon: ShieldCheck, label: "100% authentic" },
              { icon: RotateCcw, label: "7-day returns" },
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
              {Object.entries(product.specs).map(([k, v]) => (
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
                  In stock
                </dt>
                <dd className="text-sm">{activeStock} units</dd>
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

      {/* Related */}
      <section className="border-t hair py-16">
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
