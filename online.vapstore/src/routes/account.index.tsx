import { createFileRoute, Link } from "@tanstack/react-router";
import { Award, ArrowRight, Package, Sparkles } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import {
  AccountShell,
  EmptyState,
  Panel,
  Stat,
} from "@/components/account/AccountShell";
import { getAccountOrders } from "@/lib/account-api";
import { useAccount } from "@/lib/account-context";
import { requireAccount } from "@/lib/require-account";
import { formatPrice } from "@/lib/format";

export const Route = createFileRoute("/account/")({
  beforeLoad: requireAccount,
  // Just the recent few. The full list is one tap away and this page is meant
  // to be read in about three seconds.
  loader: () => getAccountOrders({ data: 1 }),
  validateSearch: (search: Record<string, unknown>): { claimed?: number } => {
    const claimed = Number(search.claimed || 0);
    return Number.isFinite(claimed) && claimed > 0 ? { claimed } : {};
  },
  component: Overview,
  head: () => ({
    meta: [
      { title: "Your account — Cliffs of Puff" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

// Stages where a parcel is still moving. The only thing on this page worth
// interrupting somebody about.
const LIVE = ["paid", "processing", "ready", "shipped"];

const shortDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function Overview() {
  const { customer } = useAccount();
  const { orders } = Route.useLoaderData();
  const { claimed } = Route.useSearch();
  const loyalty = customer!.loyalty;
  const open = orders.filter((order) => LIVE.includes(order.status));
  const recent = orders.slice(0, 4);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AccountShell
        eyebrow="Your account"
        title={`Hello, ${firstName(customer!.name)}.`}
        lede={
          open.length
            ? `You have ${open.length} order${open.length === 1 ? "" : "s"} on the way.`
            : "Everything here is yours — your orders, your rewards and your details."
        }
      >
        <div className="space-y-5 sm:space-y-6">
          {claimed ? (
            <p className="flex items-start gap-3 border border-accent bg-accent/15 px-4 py-3 text-sm">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                We found {claimed} earlier order{claimed === 1 ? "" : "s"} placed
                with your email and added {claimed === 1 ? "it" : "them"} to your
                history.
              </span>
            </p>
          ) : null}

          {/* Two across on a phone. Three would leave each figure about 100px,
              which puts a currency total onto two lines. */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Stat label="Orders" value={String(customer!.stats.orders)} />
            <Stat label="Total spent" value={formatPrice(customer!.stats.spend)} />
            <Stat
              label="On the way"
              value={String(open.length)}
              note={open.length ? "in progress" : "nothing pending"}
            />
            {loyalty.enabled ? (
              <Stat
                label={loyalty.pointsName}
                value={loyalty.balance.toLocaleString()}
                note={`worth ${formatPrice(loyalty.value)}`}
                accent
              />
            ) : (
              <Stat
                label="Member since"
                value={new Date(customer!.createdAt).getFullYear().toString()}
              />
            )}
          </div>

          {loyalty.enabled && (
            <section className="border hair bg-ink text-primary-foreground">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-4 py-5 sm:px-6 sm:py-6">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest opacity-70">
                    {loyalty.programName}
                  </div>
                  <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
                    <span className="font-display text-4xl leading-none tabular-nums sm:text-5xl">
                      {loyalty.balance.toLocaleString()}
                    </span>
                    <span className="pb-1 text-sm opacity-80">
                      {loyalty.pointsName}
                    </span>
                  </div>
                  <p className="mt-2 text-sm opacity-80">
                    {formatPrice(loyalty.value)} off your next order
                    {loyalty.pending > 0
                      ? ` · ${loyalty.pending.toLocaleString()} more on the way`
                      : ""}
                  </p>
                </div>

                {loyalty.tier && (
                  <div className="sm:text-right">
                    <span className="inline-flex items-center gap-1.5 bg-accent px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-accent-foreground">
                      <Award className="h-3.5 w-3.5" />
                      {loyalty.tier.name}
                    </span>
                    {loyalty.tier.perk && (
                      <p className="mt-2 max-w-[16rem] text-xs opacity-70">
                        {loyalty.tier.perk}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {loyalty.nextTier && (
                <div className="border-t border-white/15 px-4 py-4 sm:px-6">
                  <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-widest opacity-70">
                    <span>{loyalty.tier?.name || "Getting started"}</span>
                    <span>{loyalty.nextTier.name}</span>
                  </div>
                  <div className="mt-2 h-1 w-full bg-white/20">
                    <div
                      className="h-full bg-accent transition-[width] duration-500"
                      style={{ width: `${Math.round(loyalty.tierProgress * 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs opacity-70">
                    {Math.max(
                      0,
                      loyalty.nextTier.threshold - loyalty.lifetime,
                    ).toLocaleString()}{" "}
                    more to reach {loyalty.nextTier.name}
                    {loyalty.nextTier.multiplier > 1
                      ? ` and earn ${loyalty.nextTier.multiplier}× on everything`
                      : ""}
                    .
                  </p>
                </div>
              )}

              <Link
                to="/account/rewards"
                className="flex items-center justify-between border-t border-white/15 px-4 py-3.5 font-mono text-[10px] uppercase tracking-widest transition-colors hover:bg-white/10 sm:px-6"
              >
                See how to earn more
                <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          )}

          <Panel
            title="Recent orders"
            flush
            action={
              orders.length > 0 ? (
                <Link
                  to="/account/orders"
                  className="shrink-0 font-mono text-[10px] uppercase tracking-widest underline underline-offset-4 hover:text-accent-foreground"
                >
                  See all
                </Link>
              ) : null
            }
          >
            {recent.length ? (
              <ul className="divide-y hair">
                {recent.map((order) => (
                  <li key={order.orderNo}>
                    <Link
                      to="/account/orders/$orderNo"
                      params={{ orderNo: order.orderNo }}
                      className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted sm:px-5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="font-mono text-xs font-semibold">
                            {order.orderNo}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${
                              LIVE.includes(order.status)
                                ? "bg-accent text-accent-foreground"
                                : "text-ink-muted"
                            }`}
                          >
                            {order.statusLabel}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-xs text-ink-muted">
                          {shortDate(order.placedAt)} · {order.itemCount} item
                          {order.itemCount === 1 ? "" : "s"}
                        </div>
                      </div>
                      <span className="shrink-0 font-display text-sm tabular-nums">
                        {formatPrice(order.total)}
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-ink-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Package}
                title="No orders yet"
                cta={{ to: "/shop", label: "Start shopping" }}
              >
                When you order, you'll be able to follow it here from packed to
                delivered.
              </EmptyState>
            )}
          </Panel>
        </div>
      </AccountShell>
      <Footer />
    </div>
  );
}
