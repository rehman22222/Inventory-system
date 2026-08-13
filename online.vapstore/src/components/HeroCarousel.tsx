import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { HeroSlide } from "@/lib/catalog";

const AUTOPLAY_MS = 6500;
const HERO_CTA_CLASS =
  "group inline-flex max-w-[58vw] items-center justify-center gap-1 rounded-full border border-white/35 bg-black/58 px-2.5 py-1.5 font-display text-[7px] font-bold uppercase tracking-[0.105em] text-white shadow-[0_10px_22px_rgba(0,0,0,0.42)] ring-1 ring-black/15 backdrop-blur-xl transition-all hover:border-white/70 hover:bg-white hover:text-ink hover:shadow-[0_22px_55px_rgba(0,0,0,0.5)] active:scale-[0.98] md:max-w-[82vw] md:gap-2 md:px-6 md:py-3 md:text-xs";

function HeroButton({ slide, active }: { slide: HeroSlide; active: boolean }) {
  const { t } = useTranslation();
  if (!slide.linked || !slide.ctaPrimary) return null;
  const label = slide.ctaPrimary.label || t("hero.shopNow");
  const stopCarouselDrag = (event: PointerEvent<HTMLAnchorElement>) => {
    event.stopPropagation();
  };

  if (slide.ctaPrimary.to === "/product/$id" && slide.ctaPrimary.params?.id) {
    return (
      <Link
        to="/product/$id"
        params={{ id: slide.ctaPrimary.params.id }}
        tabIndex={active ? 0 : -1}
        onPointerDown={stopCarouselDrag}
        className={HERO_CTA_CLASS}
      >
        {label}
        <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white text-ink transition-transform group-hover:translate-x-1 group-hover:bg-ink group-hover:text-white md:h-6 md:w-6">
          <ArrowRight className="h-2.5 w-2.5 md:h-3.5 md:w-3.5" />
        </span>
      </Link>
    );
  }

  if (slide.ctaPrimary.to === "/category/$slug" && slide.ctaPrimary.params?.slug) {
    return (
      <Link
        to="/category/$slug"
        params={{ slug: slide.ctaPrimary.params.slug }}
        tabIndex={active ? 0 : -1}
        onPointerDown={stopCarouselDrag}
        className={HERO_CTA_CLASS}
      >
        {label}
        <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white text-ink transition-transform group-hover:translate-x-1 group-hover:bg-ink group-hover:text-white md:h-6 md:w-6">
          <ArrowRight className="h-2.5 w-2.5 md:h-3.5 md:w-3.5" />
        </span>
      </Link>
    );
  }

  if (slide.ctaPrimary.search?.products) {
    return (
      <Link
        to="/shop"
        search={{ products: slide.ctaPrimary.search.products }}
        tabIndex={active ? 0 : -1}
        onPointerDown={stopCarouselDrag}
        className={HERO_CTA_CLASS}
      >
        {label}
        <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white text-ink transition-transform group-hover:translate-x-1 group-hover:bg-ink group-hover:text-white md:h-6 md:w-6">
          <ArrowRight className="h-2.5 w-2.5 md:h-3.5 md:w-3.5" />
        </span>
      </Link>
    );
  }

  return (
    <Link
      to="/shop"
      search={slide.ctaPrimary.search?.q ? { q: slide.ctaPrimary.search.q } : {}}
      tabIndex={active ? 0 : -1}
      onPointerDown={stopCarouselDrag}
      className={HERO_CTA_CLASS}
    >
      {label}
      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-white text-ink transition-transform group-hover:translate-x-1 group-hover:bg-ink group-hover:text-white md:h-6 md:w-6">
        <ArrowRight className="h-2.5 w-2.5 md:h-3.5 md:w-3.5" />
      </span>
    </Link>
  );
}

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const { t } = useTranslation();
  const n = slides.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStart = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback((i: number) => setIndex(((i % n) + n) % n), [n]);
  const next = useCallback(() => goTo(index + 1), [index, goTo]);
  const prev = useCallback(() => goTo(index - 1), [index, goTo]);

  useEffect(() => {
    if (paused || n <= 1) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % n), AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [paused, n]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (n <= 1) return;
    dragStart.current = event.clientX;
    setPaused(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (dragStart.current == null) return;
    setDragOffset(event.clientX - dragStart.current);
  };
  const endDrag = () => {
    if (dragStart.current == null) return;
    const width = trackRef.current?.clientWidth ?? 1;
    const threshold = Math.min(120, width * 0.14);
    if (dragOffset > threshold) prev();
    if (dragOffset < -threshold) next();
    dragStart.current = null;
    setDragOffset(0);
    setPaused(false);
  };

  if (!n) return null;
  const positionClass = (position?: HeroSlide["ctaPosition"]) => {
    if (position === "bottom-center") return "justify-center";
    if (position === "bottom-right") return "justify-end";
    return "justify-start";
  };

  return (
    <section
      className="relative overflow-hidden border-b hair bg-black text-white"
      aria-label="Featured banner"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        className="touch-pan-y overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="flex"
          style={{
            width: `${n * 100}%`,
            transform: `translate3d(calc(-${index * (100 / n)}% + ${dragOffset}px), 0, 0)`,
            transition:
              dragOffset === 0 ? "transform 650ms cubic-bezier(0.65,0,0.35,1)" : "none",
          }}
        >
          {slides.map((slide, slideIndex) => (
            <div
              key={slide.id}
              className="relative shrink-0"
              style={{ width: `${100 / n}%` }}
              aria-hidden={slideIndex !== index}
            >
              <div
                className={`relative w-full overflow-hidden bg-black ${
                  slide.mobileImage ? "aspect-[16/8] md:aspect-[14/5]" : "aspect-[14/5]"
                }`}
              >
                <picture className="block h-full w-full">
                  {slide.mobileImage && (
                    <source media="(max-width: 767px)" srcSet={slide.mobileImage} />
                  )}
                  <img
                    src={slide.image}
                    alt={slide.imageAlt || t("hero.promoAlt")}
                    draggable={false}
                    loading={slideIndex === 0 ? "eager" : "lazy"}
                    decoding="async"
                    sizes="100vw"
                    className={`h-full w-full object-cover ${
                      slideIndex === index ? "hero-slow-zoom" : ""
                    }`}
                  />
                </picture>
                {slide.linked && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent p-4 md:p-8">
                    <div className={`container-x flex ${positionClass(slide.ctaPosition)}`}>
                      <div className="pointer-events-auto">
                        <HeroButton slide={slide} active={slideIndex === index} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {n > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous banner"
            onClick={prev}
            className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center border border-white/25 bg-black/45 text-white backdrop-blur transition-colors hover:border-accent hover:bg-accent hover:text-accent-foreground md:grid"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next banner"
            onClick={next}
            className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center border border-white/25 bg-black/45 text-white backdrop-blur transition-colors hover:border-accent hover:bg-accent hover:text-accent-foreground md:grid"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-2 md:bottom-4">
            {slides.map((slide) => (
              <button
                key={slide.id}
                aria-label="Go to banner"
                onClick={() => goTo(slides.indexOf(slide))}
                className={`h-1.5 rounded-full transition-all ${
                  slides.indexOf(slide) === index ? "w-8 bg-accent" : "w-3 bg-white/45"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
