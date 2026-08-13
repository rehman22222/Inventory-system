import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Minus, Plus, ShieldCheck, Clock, RotateCcw, Check, ChevronDown } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCard } from "@/components/ProductCard";
import { availabilityOf, type Product, type Review, type ReviewSummary } from "@/lib/catalog";
import { getProductPage, getProductReviews } from "@/lib/catalog-api";
import { useCatalog } from "@/lib/catalog-context";
import { Stars } from "@/components/Stars";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/lib/cart";
import { cldProductHeroImage, cldProductThumbImage } from "@/lib/img";
import { canonicalUrl } from "@/lib/seo";

export const Route = createFileRoute("/product/$id")({
  component: ProductPage,
  validateSearch: (search: Record<string, unknown>) => ({
    event: typeof search.event === "string" ? search.event : "",
  }),
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
          { title: `${loaderData.product.name} — Cliffs of Puff` },
          { name: "description", content: loaderData.product.short },
          { property: "og:title", content: loaderData.product.name },
          { property: "og:description", content: loaderData.product.short },
          { property: "og:image", content: loaderData.product.image },
          { property: "og:type", content: "product" },
        ]
      : [],
    links: loaderData
      ? [{ rel: "canonical", href: canonicalUrl(`/product/${loaderData.product.id}`) }]
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
  const search = Route.useSearch();
  const { promises } = settings;
  const { add, listingQty } = useCart();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const familyChoices = product.linkedListings || [];
  const hasFamilyChoices = familyChoices.length > 0;
  const fallbackGalleryCover =
    product.gallery.find((image) => image.url && image.url !== product.image)?.url ||
    product.gallery[0]?.url ||
    "";
  const defaultCatalogImage =
    product.catalogImage ||
    product.familyImage ||
    (hasFamilyChoices ? fallbackGalleryCover : "") ||
    product.image;
  const strengthPattern = /\b\d+(?:\.\d+)?\s*mg\b/i;
  const volumePattern = /\b\d+(?:\.\d+)?\s*ml\b/i;
  const inferOptionLabel = (items: { label: string }[], fallback = "Option") => {
    const labels = items.map((item) => item.label || "").filter(Boolean);
    if (!labels.length) return fallback;
    if (labels.every((label) => volumePattern.test(label) || strengthPattern.test(label))) {
      return "Volume";
    }
    return fallback;
  };
  const displayOptionLabel = (
    preferred: string | undefined,
    items: { label: string }[],
    fallback = "Option",
  ) => {
    if (preferred?.trim()) return preferred.trim();
    const inferred = inferOptionLabel(items, fallback);
    return inferred;
  };
  const familyOptionLabelFor = (item: Product) =>
    item.familyLabel ||
    item.selfVariantLabel ||
    item.variantLabel ||
    item.flavor ||
    item.name;
  const familyOptions = hasFamilyChoices ? [product, ...familyChoices] : [];
  const [selectedFamilyId, setSelectedFamilyId] = useState(
    hasFamilyChoices ? "" : product.listingId,
  );
  const selectedFamily = familyOptions.find(
    (choice) => choice.listingId === selectedFamilyId,
  );
  const choiceProduct = selectedFamily || product;
  const hasChosenFamily = !hasFamilyChoices || Boolean(selectedFamily);
  const hasVariantChoices = choiceProduct.variants.length > 0;
  const [selectedProductId, setSelectedProductId] = useState(
    hasVariantChoices ? "" : choiceProduct.productId,
  );
  // A manually clicked thumbnail wins until the shopper changes option; picking a
  // different flavour/colour clears it so that option's own photo shows.
  const [imageOverride, setImageOverride] = useState<string | null>(null);

  useEffect(() => {
    setSelectedFamilyId(hasFamilyChoices ? "" : product.listingId);
  }, [hasFamilyChoices, product.listingId]);

  useEffect(() => {
    setSelectedProductId(choiceProduct.variants.length > 0 ? "" : choiceProduct.productId);
    setQty(1);
    setImageOverride(null);
  }, [choiceProduct.listingId, choiceProduct.productId, choiceProduct.variants.length]);

  const selectedVariant = choiceProduct.variants.find(
    (variant) => variant.productId === selectedProductId,
  );
  const activeProductId = selectedVariant?.productId || choiceProduct.productId;
  const activePrice = selectedVariant?.price ?? choiceProduct.price;
  const eventOffer = (settings.events?.items || []).find(
    (item) =>
      item.enabled &&
      item.kind === "product" &&
      item.targetId === choiceProduct.listingId &&
      (!search.event || item.targetId === search.event) &&
      Number(item.eventPrice) > 0,
  );
  const eventUnitPrice = eventOffer ? Math.min(Number(eventOffer.eventPrice), activePrice) : null;
  const activeStock = selectedVariant?.stock ?? choiceProduct.stock;
  // Options imported without their own image can often still be matched to one
  // of the product's gallery photos by name (e.g. the "Cola" flavour ? a
  // "cuba-cola.webp" gallery image). Display-only and conservative: it fires
  // only when the option has no explicit image and only on an exact
  // name-in-filename match, so it can never show the wrong flavour.
  const normalizeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const imageForVariant = (
    variant: Product["variants"][number],
    source: Product = choiceProduct,
  ): string => {
    if (variant.image) return variant.image;
    const key = normalizeName(variant.label);
    if (key.length < 4) return "";
    const hit = source.gallery.find((image) =>
      normalizeName(image.url.split("/").pop() || "").includes(key),
    );
    return hit?.url || "";
  };
  const familyImage = choiceProduct.familyImage || choiceProduct.image;
  const activeImage =
    (selectedVariant ? imageForVariant(selectedVariant, choiceProduct) : "") || familyImage;
  const needsFamilyChoice = hasFamilyChoices && !selectedFamily;
  const needsVariantChoice = hasVariantChoices && !selectedVariant;
  const displayImage = selectedVariant
    ? activeImage
    : needsFamilyChoice
      ? defaultCatalogImage
      : hasFamilyChoices
        ? familyImage
        : hasVariantChoices
          ? defaultCatalogImage
          : product.image;
  // Every distinct picture: the option images sit alongside the gallery so a
  // shopper can click any flavour/colour photo to open it.
  const gallerySource = needsFamilyChoice || needsVariantChoice
    ? [displayImage]
    : hasChosenFamily
    ? [
        displayImage,
        hasFamilyChoices ? familyImage : choiceProduct.familyImage,
        activeImage,
        ...choiceProduct.variants.map((variant) => variant.image),
        ...choiceProduct.gallery.map((image) => image.url),
      ]
    : [defaultCatalogImage];
  const gallery = gallerySource.filter(
    (url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index,
  );

  // Preload the option/gallery photos after the product page opens. The user
  // can then switch flavours/colours without the ?wait for image download?
  // feeling, especially on mobile data.
  useEffect(() => {
    const productsToWarm = [product, ...familyChoices];
    const urls = productsToWarm
      .flatMap((item) => [
        item.image,
        ...item.variants.map((variant) => imageForVariant(variant, item)),
        ...item.gallery.map((image) => image.url),
        item.qtyDeal?.image || "",
        item.dealImage || "",
      ])
      .filter((url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index);

    const timer = window.setTimeout(() => {
      urls.slice(0, 20).forEach((url) => {
        const img = new Image();
        img.decoding = "async";
        img.src = cldProductHeroImage(url);
      });
    }, 80);

    return () => window.clearTimeout(timer);
    // `product` only changes when this route loads another slug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);
  // Clicking a photo that belongs to a flavour/colour option should select that
  // option too ? so the picture and the option buttons stay in sync both ways
  // (option ? picture already worked; this makes picture ? option work).
  const selectImage = (image: string) => {
    const variant = choiceProduct.variants.find((v) => imageForVariant(v, choiceProduct) === image);
    if (variant) {
      setSelectedProductId(variant.productId);
      setImageOverride(null); // show the option's own photo
      setQty(1);
    } else {
      setImageOverride(image);
    }
  };
  const onSale = !!choiceProduct.compareAt;
  const outOfStock = activeStock <= 0;
  const availability = availabilityOf(activeStock);
  const priceUnavailable = activePrice <= 0;
  const familyRequired = needsFamilyChoice;
  const optionRequired = needsVariantChoice;
  const unavailable = outOfStock || priceUnavailable || familyRequired || optionRequired;

  // Quantity deal ("buy N+ of any flavour, ?X each"). It applies once the
  // combined quantity of this product in the basket ? every flavour together,
  // plus the amount about to be added ? reaches the threshold.
  const qtyDeal = choiceProduct.qtyDeal || null;
  const inCartForListing = listingQty(choiceProduct.listingId);
  const projectedQty = inCartForListing + qty;
  const qtyDealActive = !!qtyDeal && projectedQty >= qtyDeal.minQty;
  const effectiveUnit = eventUnitPrice ?? (qtyDealActive ? qtyDeal!.price : activePrice);
  const qtyDealPct = qtyDeal
    ? Math.round((1 - qtyDeal.price / (qtyDeal.regularPrice || activePrice || 1)) * 100)
    : 0;

  const labelForKind = (kind: Product["variants"][number]["kind"]) => {
    if (kind === "flavour") return "Flavour";
    if (kind === "colour") return "Colour";
    return displayOptionLabel(choiceProduct.optionLabel, choiceProduct.variants, "Option");
  };

  // Options are grouped for optgroup labels, but shown through one native select
  // so mobile gets the familiar "Choose an option" picker and checkout still
  // receives one exact inventory-linked SKU.
  const variantGroups = (["flavour", "colour", "option"] as const)
    .map((kind) => ({
      kind,
      label: labelForKind(kind),
      items: choiceProduct.variants.filter((variant) => (variant.kind || "option") === kind),
    }))
    .filter((group) => group.items.length > 0);
  const variantSelectLabel =
    variantGroups.length === 1
      ? variantGroups[0].label
      : displayOptionLabel(choiceProduct.optionLabel, choiceProduct.variants, "Option");
  const familySelectLabel = displayOptionLabel(
    product.variantLabel,
    familyOptions.map((item) => ({ label: familyOptionLabelFor(item) })),
    "Option",
  );

  const lineFor = () => ({
    id: `${choiceProduct.id}::${activeProductId}${eventUnitPrice ? "::event" : ""}`,
    slug: product.id,
    listingId: choiceProduct.listingId,
    productId: activeProductId,
    variantLabel:
      [hasFamilyChoices ? familyOptionLabelFor(choiceProduct) : "", selectedVariant?.label]
        .filter(Boolean)
        .join(" / ") || undefined,
    name: [
      product.name,
      hasFamilyChoices ? familyOptionLabelFor(choiceProduct) : "",
      selectedVariant?.label,
    ]
      .filter(Boolean)
      .join(" - "),
    brand: choiceProduct.brand,
    price: activePrice,
    image: displayImage,
    maxStock: activeStock,
    ...(eventUnitPrice
      ? {
          eventId: choiceProduct.listingId,
          eventPrice: eventUnitPrice,
          eventLabel: settings.events?.heading || "Event offer",
        }
      : {}),
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

      <div className="container-x overflow-x-auto py-3 font-mono text-[10px] uppercase tracking-[0.28em] text-ink-muted sm:py-4 sm:text-[11px]">
        <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
          <Link to="/" className="hover:text-ink">
            Home
          </Link>
          <span>/</span>
          <Link to="/category/$slug" params={{ slug: product.category }} className="hover:text-ink">
            {product.category.replace("-", " ")}
          </Link>
          <span>/</span>
          <span className="max-w-[18rem] truncate text-ink sm:max-w-[34rem]">
            {product.name}
          </span>
        </div>
      </div>

      <section className="container-x grid gap-6 pb-10 sm:gap-8 sm:pb-12 lg:grid-cols-[1fr_1fr]">
        {/* Gallery */}
        <div className="grid gap-3 lg:sticky lg:top-28 lg:self-start">
          <div className="relative aspect-square max-h-[560px] overflow-hidden border hair bg-white p-4 sm:p-8">
            <img
              src={cldProductHeroImage(imageOverride ?? displayImage)}
              alt={product.name}
              loading="eager"
              decoding="async"
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="mx-auto h-full w-full max-w-[92%] object-contain"
            />
            {onSale && (
              <span className="absolute left-0 top-0 bg-[color:var(--sale)] text-primary-foreground font-mono text-[10px] uppercase tracking-widest px-2 py-1">
                -{Math.round((1 - activePrice / (product.compareAt || 1)) * 100)}%
              </span>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="grid grid-cols-4 gap-2 sm:gap-3">
              {gallery.slice(0, 8).map((image) => (
                <button
                  type="button"
                  key={image}
                  onClick={() => selectImage(image)}
                  aria-label="View this photo"
                  className={`border hair bg-white aspect-square overflow-hidden p-1.5 transition-opacity hover:opacity-90 ${
                    image === (imageOverride ?? displayImage) ? "outline outline-2 outline-ink" : ""
                  }`}
                >
                  <img
                    src={cldProductThumbImage(image)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink-muted sm:text-[11px]">
            {product.brand} · {product.category.replace("-", " ")}
          </div>
          <h1 className="mt-3 break-words font-display text-3xl leading-[1] tracking-tight sm:text-4xl md:text-5xl md:leading-[0.95]">
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

          <div className="mt-6 flex flex-wrap items-baseline gap-3 sm:mt-8 sm:gap-4">
            <span className="font-display text-3xl sm:text-4xl">
              {familyRequired
                ? formatPrice(product.price)
                : priceUnavailable
                  ? "Price to be confirmed"
                  : formatPrice(effectiveUnit)}
            </span>
            {(eventUnitPrice || onSale) && (
              <span className="font-mono text-sm text-ink-muted line-through">
                {formatPrice(eventUnitPrice ? activePrice : product.compareAt!)}
              </span>
            )}
          </div>

          {eventUnitPrice && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[color:var(--sale)] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-white">
              {settings.events?.heading || "Event offer"} price applied
            </div>
          )}

          {qtyDeal && !priceUnavailable && !eventUnitPrice && (
            <div className="mt-4 flex items-center gap-4 border hair bg-surface p-3">
              {qtyDeal.image ? (
                <img
                  src={cldProductThumbImage(qtyDeal.image)}
                  alt="Deal"
                  loading="lazy"
                  decoding="async"
                  className="h-16 w-16 shrink-0 border hair bg-white object-contain p-1"
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
                src={cldProductHeroImage(product.dealImage)}
                alt="Deal"
                loading="lazy"
                decoding="async"
                className="max-h-40 w-full object-contain p-2"
              />
            </div>
          )}

          {(hasFamilyChoices || variantGroups.length > 0) ? (
            <div className="mt-6 space-y-3 sm:mt-8">
              {hasFamilyChoices && (
                <div className="grid border hair bg-surface sm:grid-cols-[150px_1fr]">
                  <div className="flex items-center border-b hair px-3 py-2 font-display text-sm text-ink sm:border-b-0 sm:border-r sm:px-4 sm:py-3">
                    {familySelectLabel}
                  </div>
                  <div className="relative">
                    <select
                      id="product-family-option"
                      value={selectedFamily?.listingId || ""}
                      onChange={(event) => {
                        setSelectedFamilyId(event.target.value);
                        setQty(1);
                        setImageOverride(null);
                      }}
                      className="h-full min-h-12 w-full appearance-none bg-transparent px-3 pr-10 text-sm text-ink outline-none transition-colors hover:bg-background/50 focus:ring-2 focus:ring-ink/20 sm:min-h-14 sm:px-4 sm:pr-12 sm:text-base"
                      required
                    >
                      <option value="">Choose an option</option>
                      {familyOptions.map((choice) => (
                        <option
                          key={choice.listingId}
                          value={choice.listingId}
                          disabled={choice.stock <= 0}
                        >
                          {familyOptionLabelFor(choice)}
                          {choice.stock <= 0 ? " - sold out" : ""}
                        </option>
                      ))}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-muted sm:right-4">
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              )}

              {(!hasFamilyChoices || selectedFamily) && variantGroups.length > 0 && (
                <div className="grid border hair bg-surface sm:grid-cols-[150px_1fr]">
                  <div className="flex items-center border-b hair px-3 py-2 font-display text-sm text-ink sm:border-b-0 sm:border-r sm:px-4 sm:py-3">
                    {variantSelectLabel}
                  </div>
                  <div className="relative">
                    <select
                      id="product-option"
                      value={selectedVariant?.productId || ""}
                      onChange={(event) => {
                        const next = event.target.value;
                        setSelectedProductId(next || choiceProduct.productId);
                        setQty(1);
                        setImageOverride(null);
                      }}
                      className="h-full min-h-12 w-full appearance-none bg-transparent px-3 pr-10 text-sm text-ink outline-none transition-colors hover:bg-background/50 focus:ring-2 focus:ring-ink/20 sm:min-h-14 sm:px-4 sm:pr-12 sm:text-base"
                      required
                    >
                      <option value="">Choose an option</option>
                      {variantGroups.map((group) =>
                        variantGroups.length > 1 ? (
                          <optgroup key={group.kind} label={group.label}>
                            {group.items.map((variant) => (
                              <option
                                key={variant.productId}
                                value={variant.productId}
                                disabled={variant.stock <= 0}
                              >
                                {variant.label}
                                {variant.stock <= 0 ? " - sold out" : ""}
                              </option>
                            ))}
                          </optgroup>
                        ) : (
                          group.items.map((variant) => (
                            <option
                              key={variant.productId}
                              value={variant.productId}
                              disabled={variant.stock <= 0}
                            >
                              {variant.label}
                              {variant.stock <= 0 ? " - sold out" : ""}
                            </option>
                          ))
                        ),
                      )}
                    </select>
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ink-muted sm:right-4">
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              )}
              {selectedVariant && (
                <div className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">
                  {selectedVariant.stock > 0
                    ? `${availabilityOf(selectedVariant.stock).label} - selected`
                    : "Selected option is sold out"}
                </div>
              )}
            </div>
          ) : product.flavor ? (
            <div className="mt-8">
              <div className="eyebrow mb-2">Flavour</div>
              <div className="inline-block border hair px-3 py-1.5 font-display text-sm">
                {product.flavor}
              </div>
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-[112px_minmax(0,1fr)] items-stretch gap-3 sm:mt-8 sm:grid-cols-[152px_minmax(0,1fr)]">
            <div className="flex min-w-0 items-center border hair">
              <button
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="flex h-full flex-1 items-center justify-center p-3 hover:bg-accent hover:text-accent-foreground"
                aria-label="Decrease"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center font-display">{qty}</span>
              <button
                onClick={() => setQty(Math.min(activeStock, qty + 1))}
                className="flex h-full flex-1 items-center justify-center p-3 hover:bg-accent hover:text-accent-foreground disabled:opacity-40"
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
                familyRequired || optionRequired ? (
                  "Choose an option"
                ) : priceUnavailable ? (
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

          {!priceUnavailable && (
            <div className="mt-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">
              {outOfStock ? "Currently unavailable" : availability.label}
            </div>
          )}

          <div className="mt-8 grid gap-3 border-y hair py-5 sm:grid-cols-3 sm:py-6">
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
                  // availability line below, not our catalogue id, raw counts,
                  // or option metadata that is already handled by dropdowns.
                  const key = k.toLowerCase();
                  return (
                    !key.includes("catalogue") &&
                    !key.includes("source") &&
                    !key.includes("stock") &&
                    !key.includes("option") &&
                    !key.includes("variant") &&
                    !key.includes("flavour") &&
                    !key.includes("flavor") &&
                    !key.includes("strength") &&
                    !key.includes("volume")
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
