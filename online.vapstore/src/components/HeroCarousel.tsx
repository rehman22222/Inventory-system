import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Truck,
  Clock,
  ShieldCheck,
  Package,
} from "lucide-react";
import type { HeroSlide } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";

const AUTOPLAY_MS = 6000;

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const n = slides.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const dragStart = useRef<number | null>(null);
  const dragDelta = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback((i: number) => setIndex(((i % n) + n) % n), [n]);
  const next = useCallback(() => goTo(index + 1), [index, goTo]);
  const prev = useCallback(() => goTo(index - 1), [index, goTo]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const set = () => setReduced(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  useEffect(() => {
    if (paused || reduced || n <= 1) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % n), AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [paused, reduced, n]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = e.clientX;
    dragDelta.current = 0;
    setPaused(true);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current == null) return;
    dragDelta.current = e.clientX - dragStart.current;
    setDragOffset(dragDelta.current);
  };
  const endDrag = () => {
    if (dragStart.current == null) return;
    const w = trackRef.current?.clientWidth ?? 1;
    const threshold = Math.min(120, w * 0.12);
    if (dragDelta.current > threshold) prev();
    else if (dragDelta.current < -threshold) next();
    dragStart.current = null;
    dragDelta.current = 0;
    setDragOffset(0);
    setPaused(false);
  };

  return (
    <section
      className="relative flex flex-col bg-ink text-primary-foreground overflow-hidden border-b hair select-none lg:h-[clamp(440px,calc(100svh-157px),580px)]"
      aria-roledescription="carousel"
      aria-label="Featured offers"
      tabIndex={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") prev();
        if (e.key === "ArrowRight") next();
      }}
    >
      {/* Diagonal accent slab */}
      <div
        aria-hidden
        className="absolute inset-y-0 right-0 w-[55%] bg-accent hidden lg:block"
        style={{ clipPath: "polygon(18% 0, 100% 0, 100% 100%, 0 100%)" }}
      />
      {/* Grid backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(var(--primary-foreground) 1px, transparent 1px), linear-gradient(90deg, var(--primary-foreground) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* Track */}
      <div
        ref={trackRef}
        className="relative min-h-0 flex-1 overflow-hidden touch-pan-y cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="flex h-full"
          style={{
            width: `${n * 100}%`,
            transform: `translate3d(calc(-${index * (100 / n)}% + ${dragOffset}px), 0, 0)`,
            transition:
              dragOffset === 0 && !reduced ? "transform 700ms cubic-bezier(0.65,0,0.35,1)" : "none",
          }}
        >
          {slides.map((s, i) => (
            <div
              key={s.id}
              className="h-full shrink-0"
              style={{ width: `${100 / n}%` }}
              aria-hidden={i !== index}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${n}`}
            >
              {/* min-w-0 on both columns is load-bearing: an `fr` track's
                  automatic minimum is min-content, so a single huge word like
                  "DISPOSABLES" would otherwise force the copy column wide and
                  starve the product card. */}
              <div className="container-x grid h-full items-center gap-8 py-8 md:py-10 lg:grid-cols-[1fr_1.05fr] lg:gap-8 lg:py-6">
                {/* LEFT — copy */}
                <div className="relative z-10 flex min-w-0 flex-col gap-5">
                  <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
                    <span className="h-2 w-2 bg-accent" />
                    {s.eyebrow}
                  </div>

                  <h1 className="font-display text-[9.5vw] leading-[0.88] tracking-tight break-words sm:text-[3rem] md:text-[3.6rem] lg:text-[3.6rem] xl:text-[4.2rem]">
                    {s.titleTop}
                    <br />
                    <span
                      className="italic font-normal text-accent"
                      style={{ fontFamily: '"Instrument Serif", serif' }}
                    >
                      {s.titleItalic}
                    </span>{" "}
                    <span className="inline-block bg-primary-foreground text-ink px-3 -mx-1">
                      {s.titleBadge}
                    </span>
                    <br />
                    {s.titleBottom}
                  </h1>

                  <p className="max-w-lg text-sm leading-relaxed text-primary-foreground/70">
                    {s.copy}
                  </p>

                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      to={s.ctaPrimary.to as never}
                      params={s.ctaPrimary.params as never}
                      tabIndex={i === index ? 0 : -1}
                      className="group inline-flex items-center gap-2 bg-accent text-accent-foreground border border-accent px-5 py-3 font-display text-xs uppercase tracking-[0.12em] hover:bg-primary-foreground hover:text-ink hover:border-primary-foreground transition-colors"
                    >
                      {s.ctaPrimary.label}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                    {s.ctaSecondary?.label && s.ctaSecondary?.to && (
                      <Link
                        to={s.ctaSecondary.to as never}
                        params={s.ctaSecondary.params as never}
                        tabIndex={i === index ? 0 : -1}
                        className="inline-flex items-center gap-2 border border-primary-foreground/30 px-5 py-3 font-display text-xs uppercase tracking-[0.12em] hover:bg-primary-foreground hover:text-ink transition-colors"
                      >
                        {s.ctaSecondary.label} <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </div>

                  {/* Trust row */}
                  <div className="grid grid-cols-2 gap-x-5 gap-y-2 border-t border-primary-foreground/15 pt-4 font-mono text-[10px] uppercase tracking-widest sm:grid-cols-4">
                    {[
                      { icon: Truck, label: "Free shipping" },
                      { icon: Clock, label: "Same-day dispatch" },
                      { icon: ShieldCheck, label: "100% authentic" },
                      { icon: Package, label: "Discreet packaging" },
                    ].map((v, k) => (
                      <div key={k} className="flex items-center gap-2 text-primary-foreground/70">
                        <v.icon className="h-3.5 w-3.5 text-accent shrink-0" />
                        <span className="truncate">{v.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* RIGHT — product showcase */}
                <div className="relative min-w-0">
                  {/* Rotated burst badge. On small screens it sits top-RIGHT so
                      it can't cover the product's own badges on the left. */}
                  <div className="absolute -top-3 -right-3 md:-top-2 md:left-[-1.5rem] md:right-auto z-20 grid place-items-center h-20 w-20 md:h-24 md:w-24 bg-ink text-primary-foreground border-2 border-accent rotate-[-8deg]">
                    <div className="text-center leading-none">
                      <div className="font-mono text-[8px] md:text-[9px] uppercase tracking-widest text-accent">
                        {s.burst.top}
                      </div>
                      <div className="font-display text-2xl md:text-3xl mt-1">{s.burst.big}</div>
                      <div className="font-mono text-[7px] md:text-[8px] uppercase tracking-widest text-primary-foreground/60 mt-1">
                        {s.burst.bottom}
                      </div>
                    </div>
                  </div>

                  <Link
                    to={s.ctaPrimary.to as never}
                    params={s.ctaPrimary.params as never}
                    tabIndex={i === index ? 0 : -1}
                    className="relative block bg-primary-foreground text-ink border-2 border-ink group"
                  >
                    <img
                      src={s.image}
                      alt={s.imageAlt || s.product?.name || ""}
                      width={1600}
                      height={1600}
                      draggable={false}
                      className="aspect-[4/3] w-full object-cover pointer-events-none lg:aspect-[16/10]"
                    />

                    <div className="absolute left-3 top-3 flex flex-col gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-widest bg-accent text-accent-foreground px-2 py-1">
                        ● {s.eyebrow}
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-widest bg-ink text-primary-foreground px-2 py-1">
                        In stock
                      </span>
                    </div>

                    <div className="absolute inset-x-0 bottom-0 bg-ink text-primary-foreground p-4 flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6 border-t-2 border-accent">
                      <div className="min-w-0">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-accent">
                          {s.product?.brand}
                        </div>
                        <div className="mt-1 font-display text-lg sm:text-xl leading-tight tracking-tight">
                          {s.product?.name}
                        </div>
                        <div className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-primary-foreground/50">
                          {s.product ? `${s.product.stock} in stock` : ""}
                        </div>
                      </div>
                      <div className="flex w-full items-baseline gap-3 sm:w-auto sm:shrink-0 sm:flex-col sm:items-end sm:gap-0 sm:text-right">
                        <div className="font-display text-2xl md:text-3xl text-accent leading-none whitespace-nowrap sm:order-2 sm:mt-1">
                          {s.product ? formatPrice(s.product.price) : ""}
                        </div>
                        {s.product?.was ? (
                          <div className="font-mono text-[10px] uppercase tracking-widest text-primary-foreground/50 line-through whitespace-nowrap sm:order-1">
                            {formatPrice(s.product.was)}
                          </div>
                        ) : null}
                        <div className="ml-auto font-mono text-[10px] uppercase tracking-widest text-primary-foreground/60 group-hover:text-accent transition-colors whitespace-nowrap sm:order-3 sm:ml-0 sm:mt-2">
                          View →
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Arrows */}
      <button
        type="button"
        aria-label="Previous slide"
        onClick={prev}
        className="hidden md:grid absolute left-4 top-1/2 -translate-y-1/2 z-30 h-12 w-12 place-items-center bg-ink/70 border border-primary-foreground/25 hover:bg-accent hover:text-accent-foreground hover:border-accent transition-colors"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Next slide"
        onClick={next}
        className="hidden md:grid absolute right-4 top-1/2 -translate-y-1/2 z-30 h-12 w-12 place-items-center bg-ink/70 border border-primary-foreground/25 hover:bg-accent hover:text-accent-foreground hover:border-accent transition-colors"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

      {/* Pagination / progress */}
      <div className="relative border-t border-primary-foreground/15">
        <div className="container-x flex items-center justify-between gap-6 py-3">
          <div className="font-mono text-[11px] uppercase tracking-widest text-primary-foreground/60">
            <span className="text-accent">{String(index + 1).padStart(2, "0")}</span>
            <span className="mx-2 text-primary-foreground/30">/</span>
            {String(n).padStart(2, "0")}
          </div>

          <div className="flex-1 flex items-center gap-2">
            {slides.map((s, i) => (
              <button
                key={s.id}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
                onClick={() => goTo(i)}
                className="flex-1 h-1.5 bg-primary-foreground/15 overflow-hidden"
              >
                <span
                  key={`${i}-${index}-${paused}`}
                  className="block h-full bg-accent origin-left"
                  style={
                    i < index || (i === index && reduced)
                      ? { transform: "scaleX(1)" }
                      : i === index
                        ? {
                            transform: "scaleX(0)",
                            animation: `heroFill ${AUTOPLAY_MS}ms linear forwards`,
                            animationPlayState: paused ? "paused" : "running",
                          }
                        : { transform: "scaleX(0)" }
                  }
                />
              </button>
            ))}
          </div>

          <div className="hidden md:block font-mono text-[10px] uppercase tracking-widest text-primary-foreground/50">
            Swipe / drag →
          </div>
        </div>
      </div>

      <style>{`
        @keyframes heroFill {
          from { transform: scaleX(0); }
          to   { transform: scaleX(1); }
        }
      `}</style>
    </section>
  );
}
