import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Award,
  ChevronRight,
  LogOut,
  Package,
  Receipt,
  User,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAccount } from "@/lib/account-context";

/* The frame every signed-in account page sits in.
 *
 * NAVIGATION IS THE WHOLE DESIGN PROBLEM HERE, and it is a different problem on
 * each screen:
 *
 *   Phone   — four destinations, one row, all four visible at once. No scroll,
 *             no overflow menu, nothing hidden. Four is exactly the number that
 *             fits a 360px screen at a comfortable tap size (~80px each), which
 *             is why the account has four sections and not five. Sign out is
 *             deliberately NOT one of them: it is not a place you go, and a
 *             destructive action sitting in a row of navigation is one people
 *             hit by accident.
 *
 *   Desktop — the same four as a left rail, with the account identity above
 *             them, so the page beside it gets the full width for content.
 *
 * It is inline rather than fixed to the bottom of the screen: the storefront
 * already floats a search button and a back-to-top arrow in the bottom-right
 * corner, and a bottom bar would sit underneath them.
 */

const NAV = [
  { to: "/account", label: "Overview", short: "Overview", icon: User, exact: true },
  { to: "/account/orders", label: "Orders", short: "Orders", icon: Package, exact: false },
  { to: "/account/rewards", label: "Rewards", short: "Rewards", icon: Award, exact: false },
  { to: "/account/details", label: "Your details", short: "Details", icon: Receipt, exact: false },
] as const;

export function AccountShell({
  title,
  eyebrow,
  lede,
  back,
  action,
  children,
}: {
  title: string;
  eyebrow?: string;
  /** One line under the title. Say what the page is for, not what it is called. */
  lede?: string;
  /** A way back up, rendered ABOVE the heading. See the note below. */
  back?: { to: string; label: string };
  action?: ReactNode;
  children: ReactNode;
}) {
  const { customer, signOut, signingOut } = useAccount();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const isActive = (to: string, exact: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <main className="container-x py-8 md:py-14">
      {/* A back link belongs ABOVE the title, not beside it.
          Put opposite the heading it reads as a page action and, on a phone
          where the row wraps, it lands squashed under the title looking like
          part of it. Above, it is unambiguously "up a level" at every width —
          which is what it is. */}
      {back && (
        <Link
          to={back.to}
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {back.label}
        </Link>
      )}

      {/* ── Page heading ──────────────────────────────────────────────────
          Same scale as every other page on the site, so the account does not
          read like a different product bolted on to the shop. */}
      <header
        className={`flex flex-wrap items-end justify-between gap-x-6 gap-y-4 ${
          back ? "mt-3" : ""
        }`}
      >
        <div className="min-w-0">
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1 className="mt-2 font-display text-4xl leading-none tracking-tight md:text-6xl">
            {title}
          </h1>
          {lede && (
            <p className="mt-3 max-w-prose text-sm text-ink-muted md:text-base">
              {lede}
            </p>
          )}
        </div>
        {action}
      </header>

      {/* ── Phone navigation ─────────────────────────────────────────────── */}
      <nav
        aria-label="Account"
        className="mt-8 grid grid-cols-4 border hair lg:hidden"
      >
        {NAV.map((item, index) => {
          const active = isActive(item.to, item.exact);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-1.5 px-1 py-3 text-center transition-colors ${
                index > 0 ? "border-l hair" : ""
              } ${
                active
                  ? "bg-ink text-primary-foreground"
                  : "text-ink-muted hover:bg-muted"
              }`}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span className="font-mono text-[10px] uppercase tracking-widest">
                {item.short}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 grid gap-10 lg:mt-12 lg:grid-cols-[220px_1fr] lg:gap-14">
        {/* ── Desktop rail ───────────────────────────────────────────────── */}
        <aside className="hidden lg:block lg:self-start lg:sticky lg:top-32">
          <div className="border-b hair pb-4">
            <div className="eyebrow">Signed in</div>
            <div className="mt-2 truncate font-display text-lg leading-tight">
              {customer?.name}
            </div>
            <div className="truncate text-sm text-ink-muted">{customer?.email}</div>
          </div>

          <nav aria-label="Account" className="mt-4 flex flex-col">
            {NAV.map((item) => {
              const active = isActive(item.to, item.exact);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={`group flex items-center gap-3 border-l-2 py-2.5 pl-3 text-sm transition-colors ${
                    active
                      ? "border-l-ink font-semibold text-ink"
                      : "border-l-transparent text-ink-muted hover:border-l-border hover:text-ink"
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="mt-6 inline-flex items-center gap-2 border-t hair pt-4 font-mono text-[10px] uppercase tracking-widest text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>

      {/* ── Phone footer ──────────────────────────────────────────────────
          Who you are and the way out, at the END of the page rather than in
          the navigation — reachable when you want it, never under a thumb
          that was reaching for "Orders". */}
      <div className="mt-12 border-t hair pt-5 lg:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{customer?.name}</div>
            <div className="truncate text-xs text-ink-muted">{customer?.email}</div>
          </div>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="inline-flex shrink-0 items-center gap-2 border hair px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-colors hover:bg-ink hover:text-primary-foreground disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </main>
  );
}

/**
 * A framed section.
 *
 * Square, hairline-bordered, flat — the same box the cart and checkout use. The
 * heading row is only rendered when there is one, so a panel can also be a
 * plain frame around something that speaks for itself.
 */
export function Panel({
  title,
  description,
  action,
  flush = false,
  children,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  /** Let the content run to the frame — for full-bleed lists and tables. */
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="border hair bg-surface">
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b hair px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-base leading-tight tracking-tight sm:text-lg">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 max-w-prose text-xs text-ink-muted sm:text-sm">
                {description}
              </p>
            )}
          </div>
          {action}
        </header>
      )}
      <div className={flush ? "" : "p-4 sm:p-5"}>{children}</div>
    </section>
  );
}

/** Nothing here yet, said in a way that offers the next step rather than a shrug. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  cta,
}: {
  icon: typeof Package;
  title: string;
  children?: ReactNode;
  cta?: { to: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center sm:py-16">
      <span className="grid h-14 w-14 place-items-center border hair text-ink-muted">
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-5 font-display text-xl leading-tight tracking-tight sm:text-2xl">
        {title}
      </h3>
      {children && (
        <p className="mt-2 max-w-sm text-sm text-ink-muted">{children}</p>
      )}
      {cta && (
        <Link to={cta.to} className="btn-primary mt-6">
          {cta.label}
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

/**
 * One headline number.
 *
 * Two per row on a phone rather than three: three columns at 360px leaves each
 * figure about 100px, which forces a currency total onto two lines.
 */
export function Stat({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`border hair p-4 ${accent ? "bg-accent/15" : "bg-surface"}`}
    >
      <div className="eyebrow truncate">{label}</div>
      <div className="mt-1.5 font-display text-2xl leading-none tabular-nums sm:text-3xl">
        {value}
      </div>
      {note && <div className="mt-1.5 text-xs text-ink-muted">{note}</div>}
    </div>
  );
}
