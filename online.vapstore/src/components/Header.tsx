import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  Search,
  ShoppingBag,
  Menu,
  X,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import {
  productsByCategory,
  topLevelCategories,
  childCategories,
  fillTokens,
  type Category,
  type CategorySlug,
} from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import logo from "@/assets/logo-cop.png";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/lib/cart";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function Header() {
  const { t } = useTranslation();
  const { categories, products, settings } = useCatalog();
  // The top nav lists parents only; each parent's children live in its mega
  // menu, so a two-deep catalogue doesn't flatten out into one long row.
  const topLevel = useMemo(() => topLevelCategories(categories), [categories]);
  const { count, ready } = useCart();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState(false);
  const [openSlug, setOpenSlug] = useState<CategorySlug | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const lastY = useRef(0);
  const closeTimer = useRef<number | null>(null);

  /* Hide the bar when the reader is moving down the page, bring it straight
   * back the moment they scroll up — the content gets the full screen, the nav
   * is never more than a flick away. */
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - lastY.current) < 6) return; // ignore jitter
      const goingDown = y > lastY.current;
      if (goingDown && y > 160) {
        setHidden(true);
        setOpenSlug(null);
        setMoreOpen(false);
      } else if (!goingDown) {
        setHidden(false);
      }
      lastY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Small delay on close so the pointer can travel from the link to the panel.
  const openMenu = (slug: CategorySlug) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setMoreOpen(false);
    setOpenSlug(slug);
  };
  const openMore = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpenSlug(null);
    setMoreOpen(true);
  };
  const scheduleClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setOpenSlug(null);
      setMoreOpen(false);
    }, 120);
  };
  // "Priority+" nav: show as many categories as fit on ONE line, the rest go
  // under "More". A hidden row (measureRef) is rendered at natural width so we
  // can measure each item and work out how many fit the visible container.
  const navRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(topLevel.length);

  useEffect(() => {
    const container = navRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const GAP = 20; // matches gap-5
    const compute = () => {
      const width = container.clientWidth;
      if (!width) return;
      const items = Array.from(measure.children) as HTMLElement[];
      if (items.length < 2) return;
      const homeW = items[0].offsetWidth;
      const moreW = items[items.length - 1].offsetWidth;
      let used = homeW;
      let count = 0;
      for (let i = 0; i < topLevel.length; i++) {
        const w = items[1 + i]?.offsetWidth ?? 0;
        const isLast = i === topLevel.length - 1;
        const reserve = isLast ? 0 : moreW + GAP; // keep room for "More"
        if (used + GAP + w + reserve <= width) {
          used += GAP + w;
          count += 1;
        } else break;
      }
      setVisibleCount(count);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [topLevel]);

  const visibleCategories = topLevel.slice(0, visibleCount);
  const overflowCategories = topLevel.slice(visibleCount);
  const announcementPrimary = fillTokens(
    settings.announcement.primary || t("announcement.primary"),
    settings,
  );
  const announcementSecondary =
    settings.announcement.secondary || t("announcement.secondary");
  const ticker = [announcementPrimary, announcementSecondary]
    .map((item) => item.replace(/[•·]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");

  const announcementEnabled =
    settings.announcement.enabled !== false && Boolean(ticker);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate({ to: "/search", search: { q: query.trim() } });
  };

  return (
    <header
      className={`sticky top-0 z-50 border-b hair bg-background/95 backdrop-blur transition-transform duration-300 ${
        hidden ? "-translate-y-full" : "translate-y-0"
      }`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpenSlug(null);
          setMoreOpen(false);
        }
      }}
    >
      {/* Announcement */}
      {announcementEnabled && (
      <div className="bg-ink text-primary-foreground">
        <div className="h-9 overflow-hidden border-b border-white/10 text-[11px] font-mono uppercase tracking-widest">
          <div className="announcement-marquee-track flex h-full items-center whitespace-nowrap">
            {[0, 1, 2, 3].map((item) => (
              <span key={item} className="mx-8 inline-flex shrink-0 items-center gap-4">
                <img
                  src={logo}
                  alt=""
                  aria-hidden="true"
                  className="h-5 w-auto object-contain"
                />
                <span>{ticker}</span>
              </span>
            ))}
          </div>
          <span className="hidden">
            {t("announcement.primary", {
              free: `€${settings.shipping.freeThreshold}`,
              dispatch: t("announcement.dispatch"),
            })}
          </span>
          <div className="hidden">
            <span className="hidden md:inline">{t("announcement.secondary")}</span>
          </div>
        </div>
      </div>
      )}

      {/* Main bar */}
      {/* Tighter vertical padding than the logo would otherwise force — the
          mark carries the height now. */}
      <div className="container-x grid h-[72px] grid-cols-[auto_1fr_auto] items-center gap-3 sm:h-[86px] sm:gap-6 lg:h-[96px]">
        <div className="flex items-center gap-2">
          <button
            className="lg:hidden -ml-2 p-2"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link to="/" className="flex items-center" aria-label="Cliffs of Puff — home">
            <img
              src={logo}
              alt="Cliffs of Puff"
              width={2430}
              height={2430}
              className="h-[61px] w-auto object-contain sm:h-[76px] lg:h-[91px]"
            />
          </Link>
        </div>

        <form onSubmit={submitSearch} className="hidden items-center border hair lg:flex">
          <Search className="ml-3 h-4 w-4 text-ink-muted shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("nav.searchPlaceholder")}
            aria-label={t("nav.searchProducts")}
            className="w-full bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-ink-muted"
          />
          <button
            type="submit"
            className="grid h-10 w-10 shrink-0 place-items-center bg-ink text-primary-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label={t("nav.search")}
            title={t("nav.search")}
          >
            <Search className="h-4 w-4" />
          </button>
        </form>

        <nav className="col-start-3 flex items-center justify-end gap-2 justify-self-end">
          <div className="hidden text-ink sm:block">
            <LanguageSwitcher />
          </div>
          <button
            aria-label={t("nav.search")}
            className="lg:hidden p-2"
            onClick={() => navigate({ to: "/search", search: { q: "" } })}
          >
            <Search className="h-5 w-5" />
          </button>
          <Link
            to="/cart"
            className="relative p-2 inline-flex items-center gap-2"
            aria-label={t("nav.cartLabel", { count: ready ? count : 0 })}
          >
            <ShoppingBag className="h-5 w-5" />
            {ready && count > 0 && (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center bg-accent px-1 font-mono text-[10px] font-bold text-accent-foreground">
                {count}
              </span>
            )}
          </Link>
        </nav>
      </div>

      {/* Category nav + mega menu */}
      <div className="hidden lg:block border-t hair" onMouseLeave={scheduleClose}>
        {/* The category names can be long ("… Ireland"), so the row scrolls
            horizontally (scrollbar hidden) instead of overflowing the page. */}
        <div className="container-x py-3 relative overflow-hidden">
          {/* Visible row — measured to fit on one line. */}
          <div ref={navRef} className="flex items-center gap-5 overflow-hidden">
            <Link
              to="/"
              className="shrink-0 font-display text-[13px] uppercase tracking-widest whitespace-nowrap hover:text-accent-foreground hover:bg-accent px-1"
            >
              {t("nav.home")}
            </Link>
            {visibleCategories.map((c) => (
              <Link
                key={c.slug}
                to="/category/$slug"
                params={{ slug: c.slug }}
                onMouseEnter={() => openMenu(c.slug)}
                onFocus={() => openMenu(c.slug)}
                aria-expanded={openSlug === c.slug}
                className={`shrink-0 font-display text-[13px] uppercase tracking-widest whitespace-nowrap transition-colors ${
                  openSlug === c.slug
                    ? "text-accent-foreground bg-accent px-1"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {c.name}
              </Link>
            ))}
            {overflowCategories.length > 0 && (
              <button
                type="button"
                onMouseEnter={openMore}
                onFocus={openMore}
                aria-expanded={moreOpen}
                className={`shrink-0 inline-flex items-center gap-1 font-display text-[13px] uppercase tracking-widest whitespace-nowrap transition-colors ${
                  moreOpen ? "bg-accent px-1 text-accent-foreground" : "text-ink-muted hover:text-ink"
                }`}
              >
                {t("nav.more")}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${moreOpen ? "rotate-180" : ""}`}
                />
              </button>
            )}
          </div>
          {/* Hidden measurement row: every category at natural width. */}
          <div
            ref={measureRef}
            aria-hidden
            className="pointer-events-none invisible absolute left-0 top-0 flex items-center gap-5 whitespace-nowrap"
          >
            <span className="font-display text-[13px] uppercase tracking-widest px-1">
              {t("nav.home")}
            </span>
            {topLevel.map((c) => (
              <span
                key={c.slug}
                className="font-display text-[13px] uppercase tracking-widest px-1"
              >
                {c.name}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 font-display text-[13px] uppercase tracking-widest px-1">
              {t("nav.more")}
              <span className="inline-block h-3.5 w-3.5" />
            </span>
          </div>
        </div>

        {openSlug && (
          <MegaMenu slug={openSlug} onEnter={() => openMenu(openSlug)} onLeave={scheduleClose} />
        )}
        {moreOpen && (
          <MoreMenu categories={overflowCategories} onEnter={openMore} onLeave={scheduleClose} />
        )}
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden border-t hair bg-background">
          <div className="container-x py-4 grid gap-0.5">
            <Link
              to="/"
              onClick={() => setMobileOpen(false)}
              className="py-2.5 font-display text-sm uppercase tracking-widest border-b hair"
            >
              {t("nav.home")}
            </Link>
            <Link
              to="/shop"
              onClick={() => setMobileOpen(false)}
              className="py-2.5 font-display text-sm uppercase tracking-widest border-b hair"
            >
              {t("nav.shopAll")}
            </Link>
            {topLevel.map((c) => {
              const kids = childCategories(categories, c.slug);
              return (
                <div key={c.slug}>
                  <Link
                    to="/category/$slug"
                    params={{ slug: c.slug }}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-between py-2.5 text-sm text-ink-muted border-b hair"
                  >
                    {c.name}
                    <span className="font-mono text-[10px] tabular-nums">
                      {productsByCategory(products, c.slug).length}
                    </span>
                  </Link>
                  {kids.map((k) => (
                    <Link
                      key={k.slug}
                      to="/category/$slug"
                      params={{ slug: k.slug }}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center justify-between py-2 pl-4 text-sm text-ink-muted/80 border-b hair"
                    >
                      <span className="before:mr-2 before:text-ink-muted/40 before:content-['—']">
                        {k.name}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums">
                        {productsByCategory(products, k.slug).length}
                      </span>
                    </Link>
                  ))}
                </div>
              );
            })}
            <Link
              to="/sale"
              onClick={() => setMobileOpen(false)}
              className="py-2.5 font-display text-sm uppercase tracking-widest text-[color:var(--sale)]"
            >
              {t("nav.sale")}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function MoreMenu({
  categories,
  onEnter,
  onLeave,
}: {
  categories: Category[];
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const { products } = useCatalog();
  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="absolute left-0 right-0 top-full border-t hair bg-background shadow-[0_24px_48px_-24px_rgba(0,0,0,0.35)]"
    >
      <div className="container-x py-7">
        <div className="eyebrow mb-4">{t("nav.moreCategories")}</div>
        <div className="grid max-w-3xl gap-2 sm:grid-cols-2">
          {categories.map((category) => (
            <Link
              key={category.slug}
              to="/category/$slug"
              params={{ slug: category.slug }}
              className="group flex items-center justify-between border-b hair py-3 font-display text-lg uppercase tracking-tight hover:bg-accent hover:text-accent-foreground"
            >
              <span>{category.name}</span>
              <span className="font-mono text-[10px] font-normal tracking-widest">
                {t("nav.products", { count: productsByCategory(products, category.slug).length })}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Full-width dropdown built from the real catalogue: the brands actually
 * stocked in this category, and a few products to click straight into. */
function MegaMenu({
  slug,
  onEnter,
  onLeave,
}: {
  slug: CategorySlug;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const { categories, products } = useCatalog();
  const { category, brands, featured, total, kids } = useMemo(() => {
    const items = productsByCategory(products, slug);
    const cat = categories.find((c) => c.slug === slug)!;
    return {
      category: cat,
      brands: [...new Set(items.map((p) => p.brand))].sort(),
      featured: [...items].sort((a, b) => b.stock - a.stock).slice(0, 3),
      total: items.length,
      kids: childCategories(categories, slug),
    };
  }, [slug, categories, products]);

  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="absolute left-0 right-0 top-full border-t hair bg-background shadow-[0_24px_48px_-24px_rgba(0,0,0,0.35)]"
    >
      <div className="container-x grid grid-cols-[1.1fr_1fr_1.4fr] gap-10 py-8">
        {/* Brands */}
        <div>
          <div className="eyebrow mb-4">{t("nav.brandsIn", { category: category.name })}</div>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2">
            {brands.map((b) => (
              <li key={b}>
                <Link
                  to="/category/$slug"
                  params={{ slug }}
                  className="text-sm text-ink-muted hover:text-ink hover:underline underline-offset-4"
                >
                  {b}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Quick links */}
        <div>
          <div className="eyebrow mb-4">
            {kids.length > 0 ? t("nav.subCategories") : t("nav.quickLinks")}
          </div>
          <ul className="space-y-2">
            {kids.map((k) => (
              <li key={k.slug}>
                <Link
                  to="/category/$slug"
                  params={{ slug: k.slug }}
                  className="text-sm font-display uppercase tracking-tight hover:text-accent-foreground hover:bg-accent px-1"
                >
                  {k.name}
                </Link>
              </li>
            ))}
            <li>
              <Link
                to="/category/$slug"
                params={{ slug }}
                className="text-sm hover:text-accent-foreground hover:bg-accent px-1"
              >
                {t("nav.allCategory", { category: category.name })} ({total})
              </Link>
            </li>
            <li>
              <Link
                to="/sale"
                className="text-sm text-[color:var(--sale)] hover:underline underline-offset-4"
              >
                {t("nav.onSaleNow")}
              </Link>
            </li>
            <li>
              <Link
                to="/shop"
                className="text-sm text-ink-muted hover:text-ink hover:underline underline-offset-4"
              >
                {t("nav.newArrivals")}
              </Link>
            </li>
            <li>
              <Link
                to="/shop"
                className="text-sm text-ink-muted hover:text-ink hover:underline underline-offset-4"
              >
                {t("nav.shopEverything")}
              </Link>
            </li>
          </ul>
          <p className="mt-5 max-w-[22ch] text-xs text-ink-muted">{category.tagline}</p>
        </div>

        {/* Featured products */}
        <div>
          <div className="eyebrow mb-4">{t("nav.popularNow")}</div>
          <div className="grid grid-cols-3 gap-3">
            {featured.map((p) => (
              <Link
                key={p.id}
                to="/product/$id"
                params={{ id: p.id }}
                className="group block border hair bg-surface"
              >
                <div className="aspect-square overflow-hidden bg-white p-2">
                  <img
                    src={p.image}
                    alt={p.name}
                    loading="lazy"
                    className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-2.5">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-ink-muted truncate">
                    {p.brand}
                  </div>
                  <div className="mt-0.5 font-display text-[11px] leading-tight line-clamp-2 min-h-[2rem]">
                    {p.name}
                  </div>
                  <div className="mt-1 font-display text-xs">{formatPrice(p.price)}</div>
                </div>
              </Link>
            ))}
          </div>
          <Link
            to="/category/$slug"
            params={{ slug }}
            className="group mt-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest hover:bg-accent hover:text-accent-foreground px-1"
          >
            {t("nav.shopAllCategory", { category: category.name })}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  );
}
