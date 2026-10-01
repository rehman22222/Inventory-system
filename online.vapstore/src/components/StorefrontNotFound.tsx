import { Link } from "@tanstack/react-router";
import { ArrowRight, Home, Search } from "lucide-react";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

type StorefrontNotFoundProps = {
  eyebrow?: string;
  title?: string;
  message?: string;
};

export function StorefrontNotFound({
  eyebrow = "Page not found",
  title = "We couldn't find that page.",
  message = "The link may be out of date, or the page may have moved. Search our store or continue browsing from the links below.",
}: StorefrontNotFoundProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* No <title> here: the route's head already sets one, and a second
          rendered from the body gave the page two. The robots tag has no
          counterpart in the head, so it stays. */}
      <meta name="robots" content="noindex, follow" />
      <Header />

      <main className="relative isolate overflow-hidden border-b hair bg-surface">
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.055]"
          aria-hidden="true"
          style={{
            backgroundImage:
              "linear-gradient(var(--color-foreground) 1px, transparent 1px), linear-gradient(90deg, var(--color-foreground) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <section className="container-x flex min-h-[62vh] items-center justify-center py-14 sm:py-20 lg:py-24">
          <div className="mx-auto w-full max-w-3xl text-center">
            <div className="relative mx-auto w-fit" aria-hidden="true">
              <span className="relative font-display text-[clamp(8rem,29vw,17rem)] leading-[0.72] tracking-[-0.09em] text-ink drop-shadow-[8px_8px_0_var(--color-accent)] sm:drop-shadow-[12px_12px_0_var(--color-accent)]">
                404
              </span>
            </div>

            <h1 className="mx-auto mt-10 max-w-2xl font-display text-4xl leading-[0.98] text-ink sm:mt-12 sm:text-5xl lg:text-6xl">
              {title}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-ink-muted">{message}</p>

            <form
              action="/search"
              method="get"
              role="search"
              className="mx-auto mt-8 flex max-w-xl border hair bg-background"
            >
              <label htmlFor="not-found-search" className="sr-only">
                Search products
              </label>
              <Search
                className="ml-4 h-5 w-5 shrink-0 self-center text-ink-muted"
                aria-hidden="true"
              />
              <input
                id="not-found-search"
                name="q"
                type="search"
                required
                placeholder="Search products, flavours or brands"
                className="min-w-0 flex-1 bg-transparent px-3 py-4 text-sm text-ink outline-none placeholder:text-ink-muted"
              />
              <button
                type="submit"
                className="grid w-14 shrink-0 place-items-center bg-black text-white transition-colors hover:bg-accent hover:text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                aria-label="Search store"
              >
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </form>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/" className="btn-primary inline-flex items-center gap-2">
                <Home className="h-4 w-4" aria-hidden="true" />
                Back to home
              </Link>
              <Link
                to="/shop"
                search={{}}
                className="inline-flex items-center gap-2 border hair bg-background px-5 py-3 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-black hover:text-white"
              >
                Browse all products
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
