import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ShoppingBag, Check } from "lucide-react";
import { useState } from "react";
import type { Product } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/lib/cart";
import { cldProductCardImage } from "@/lib/img";

export function ProductCard({ product }: { product: Product }) {
  const { t } = useTranslation();
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const onSale = !!product.compareAt;
  const off = onSale ? Math.round((1 - product.price / (product.compareAt || 1)) * 100) : 0;
  const isHot = product.tags?.includes("hot");
  const outOfStock = product.stock <= 0;
  const priceUnavailable = product.price <= 0;
  const unavailable = outOfStock || priceUnavailable;
  const onlyVariant = product.variants.length === 1 ? product.variants[0] : null;
  const needsChoice = product.variants.length > 1;

  const handleAdd = () => {
    if (unavailable || needsChoice) return;
    const productId = onlyVariant?.productId || product.productId;
    add(
      {
        id: `${product.id}::${productId}`,
        slug: product.id,
        listingId: product.listingId,
        productId,
        variantLabel: onlyVariant?.label,
        name: onlyVariant?.label ? `${product.name} — ${onlyVariant.label}` : product.name,
        brand: product.brand,
        price: onlyVariant?.price ?? product.price,
        image: onlyVariant?.image || product.image,
        maxStock: onlyVariant?.stock ?? product.stock,
      },
      1,
    );
    setAdded(true);
    setTimeout(() => setAdded(false), 1400);
  };

  return (
    <div className="group flex flex-col border hair bg-surface">
      <Link
        to="/product/$id"
        params={{ id: product.id }}
        preload="intent"
        className="relative block aspect-square overflow-hidden bg-white p-1.5 sm:p-4"
      >
        <img
          src={cldProductCardImage(product.image)}
          alt={product.name}
          loading="lazy"
          decoding="async"
          sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
          className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-[1.05]"
        />
        {onSale && (
          <span
            className={`absolute top-2 rounded-full bg-[color:var(--sale)] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-primary-foreground shadow-sm sm:top-3 ${
              isHot ? "right-2 sm:right-3" : "left-2 sm:left-3"
            }`}
          >
            -{off}%
          </span>
        )}
        {isHot && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-gradient-to-r from-[#260000] via-[#b00000] to-[#ff3b1f] px-3 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-white shadow-[0_10px_28px_rgba(180,0,0,0.32)] ring-1 ring-black/10 backdrop-blur sm:left-3 sm:top-3 sm:px-3.5">
            <span className="h-1.5 w-1.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]" />
            {t("productCard.hotItem")}
          </span>
        )}
        {outOfStock && (
          <div className="absolute inset-0 grid place-items-center bg-background/70">
            <span className="bg-ink text-primary-foreground font-mono text-[11px] uppercase tracking-widest px-3 py-1.5">
              {t("productCard.outOfStock")}
            </span>
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col border-t hair p-4">
        <div className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
          {product.brand}
        </div>
        <Link
          to="/product/$id"
          params={{ id: product.id }}
          preload="intent"
          className="mt-1 font-display text-sm leading-tight tracking-tight line-clamp-2 min-h-[2.5rem] hover:text-accent-foreground hover:bg-accent"
        >
          {product.name}
        </Link>

        {/* Price */}
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-base">
            {priceUnavailable ? t("productCard.priceTbc") : formatPrice(product.price)}
          </span>
          {onSale && (
            <span className="font-mono text-xs text-ink-muted line-through">
              {formatPrice(product.compareAt!)}
            </span>
          )}
        </div>

        {/* Add to cart */}
        {needsChoice && !unavailable ? (
          <Link
            to="/product/$id"
            params={{ id: product.id }}
            preload="intent"
            className="mt-4 inline-flex items-center justify-center gap-2 bg-ink text-primary-foreground font-mono text-[11px] uppercase tracking-widest py-2.5 border border-ink transition-colors hover:bg-accent hover:text-accent-foreground hover:border-accent"
          >
            <ShoppingBag className="h-3.5 w-3.5" /> {t("productCard.chooseOptions")}
          </Link>
        ) : (
          <button
            onClick={handleAdd}
            disabled={unavailable}
            className="mt-4 inline-flex items-center justify-center gap-2 bg-ink text-primary-foreground font-mono text-[11px] uppercase tracking-widest py-2.5 border border-ink transition-colors hover:bg-accent hover:text-accent-foreground hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-ink disabled:hover:text-primary-foreground"
            aria-label={t("productCard.addLabel", { product: product.name })}
          >
            {added ? (
              <>
                <Check className="h-3.5 w-3.5" /> {t("productCard.added")}
              </>
            ) : (
              <>
                <ShoppingBag className="h-3.5 w-3.5" />{" "}
                {unavailable ? t("productCard.unavailable") : t("productCard.addToCart")}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
