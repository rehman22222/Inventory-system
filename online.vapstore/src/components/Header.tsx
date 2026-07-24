import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search, ShoppingBag, User, Menu, X, ArrowRight, ChevronDown } from "lucide-react";
import { productsByCategory, type Category, type CategorySlug } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import logo from "@/assets/logo-cop.png";
import { formatPrice } from "@/lib/format";
import { useCart } from "@/lib/cart";

export function Header() {
  const { categories, products, settings } = useCatalog();
  const { count, ready } = useCart();
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
  const primaryCategories = categories.slice(0, 7);
  const overflowCategories = categories.slice(7);

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
      <div className="bg-ink text-primary-foreground">
        <div className="container-x flex h-9 items-center justify-between text-[11px] font-mono uppercase tracking-widest">
          <span>{settings.announcement.primary}</span>
          <span className="hidden md:inline">{settings.announcement.secondary}</span>
        </div>
      </div>

      {/* Main bar */}
      {/* Tighter vertical padding than the logo would otherwise force — the
          mark carries the height now. */}
      <div className="container-x grid h-[68px] grid-cols-[auto_1fr_auto] items-center gap-6 sm:h-[76px] lg:h-[78px]">
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
              className="h-16 w-auto sm:h-20 lg:-my-3 lg:h-24"
            />
          </Link>
        </div>

        <div className="hidden lg:flex items-center border hair">
          <Search className="ml-3 h-4 w-4 text-ink-muted shrink-0" />
          <input
            type="search"
            placeholder="Search devices, flavours, brands…"
            className="w-full bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-ink-muted"
          />
          <button className="bg-ink px-4 py-2.5 text-primary-foreground font-mono text-[11px] uppercase tracking-widest">
            Search
          </button>
        </div>

        <nav className="flex items-center gap-1">
          <button aria-label="Search" className="lg:hidden p-2">
            <Search className="h-5 w-5" />
          </button>
          <Link to="/account" className="hidden md:inline-flex p-2" aria-label="Account">
            <User className="h-5 w-5" />
          </Link>
          <Link
            to="/cart"
            className="relative p-2 inline-flex items-center gap-2"
            aria-label={`Cart, ${ready ? count : 0} items`}
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
        <div className="container-x flex items-center gap-5 py-3">
          <Link
            to="/"
            className="font-display text-[13px] uppercase tracking-widest hover:text-accent-foreground hover:bg-accent px-1"
          >
            Home
          </Link>
          {primaryCategories.map((c) => (
            <Link
              key={c.slug}
              to="/category/$slug"
              params={{ slug: c.slug }}
              onMouseEnter={() => openMenu(c.slug)}
              onFocus={() => openMenu(c.slug)}
              aria-expanded={openSlug === c.slug}
              className={`font-display text-[13px] uppercase tracking-widest whitespace-nowrap transition-colors ${
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
              className={`ml-auto inline-flex items-center gap-1 font-display text-[13px] uppercase tracking-widest whitespace-nowrap transition-colors ${
                moreOpen ? "bg-accent px-1 text-accent-foreground" : "text-ink-muted hover:text-ink"
              }`}
            >
              More
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${moreOpen ? "rotate-180" : ""}`}
              />
            </button>
          )}
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
              Home
            </Link>
            <Link
              to="/shop"
              onClick={() => setMobileOpen(false)}
              className="py-2.5 font-display text-sm uppercase tracking-widest border-b hair"
            >
              Shop All
            </Link>
            {categories.map((c) => (
              <Link
                key={c.slug}
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
            ))}
            <Link
              to="/sale"
              onClick={() => setMobileOpen(false)}
              className="py-2.5 font-display text-sm uppercase tracking-widest text-[color:var(--sale)]"
            >
              Sale
            </Link>
            <Link
              to="/account"
              onClick={() => setMobileOpen(false)}
              className="py-2.5 text-sm text-ink-muted"
            >
              Account
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
  const { products } = useCatalog();
  return (
    <div
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="absolute left-0 right-0 top-full border-t hair bg-background shadow-[0_24px_48px_-24px_rgba(0,0,0,0.35)]"
    >
      <div className="container-x py-7">
        <div className="eyebrow mb-4">More categories</div>
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
                {productsByCategory(products, category.slug).length} products
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
  const { categories, products } = useCatalog();
  const { category, brands, featured, total } = useMemo(() => {
    const items = productsByCategory(products, slug);
    const cat = categories.find((c) => c.slug === slug)!;
    return {
      category: cat,
      brands: [...new Set(items.map((p) => p.brand))].sort(),
      featured: [...items].sort((a, b) => b.stock - a.stock).slice(0, 3),
      total: items.length,
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
          <div className="eyebrow mb-4">Brands in {category.name}</div>
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
          <div className="eyebrow mb-4">Quick links</div>
          <ul className="space-y-2">
            <li>
              <Link
                to="/category/$slug"
                params={{ slug }}
                className="text-sm hover:text-accent-foreground hover:bg-accent px-1"
              >
                All {category.name} ({total})
              </Link>
            </li>
            <li>
              <Link
                to="/sale"
                className="text-sm text-[color:var(--sale)] hover:underline underline-offset-4"
              >
                On sale now
              </Link>
            </li>
            <li>
              <Link
                to="/shop"
                className="text-sm text-ink-muted hover:text-ink hover:underline underline-offset-4"
              >
                New arrivals
              </Link>
            </li>
            <li>
              <Link
                to="/shop"
                className="text-sm text-ink-muted hover:text-ink hover:underline underline-offset-4"
              >
                Shop everything
              </Link>
            </li>
          </ul>
          <p className="mt-5 max-w-[22ch] text-xs text-ink-muted">{category.tagline}</p>
        </div>

        {/* Featured products */}
        <div>
          <div className="eyebrow mb-4">Popular right now</div>
          <div className="grid grid-cols-3 gap-3">
            {featured.map((p) => (
              <Link
                key={p.id}
                to="/product/$id"
                params={{ id: p.id }}
                className="group block border hair bg-surface"
              >
                <div className="aspect-square overflow-hidden bg-background">
                  <img
                    src={p.image}
                    alt={p.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
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
            Shop all {category.name}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  );
}
