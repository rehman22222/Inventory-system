import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, ChevronRight, Package } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AccountShell, EmptyState, Panel } from "@/components/account/AccountShell";
import { getAccountOrders } from "@/lib/account-api";
import { useAccount } from "@/lib/account-context";
import { requireAccount } from "@/lib/require-account";
import { formatPrice } from "@/lib/format";

export const Route = createFileRoute("/account/orders/")({
  beforeLoad: requireAccount,
  // Optional, so an ordinary link to /account/orders needs no search object.
  // Page one is the default everywhere it is read.
  validateSearch: (search: Record<string, unknown>): { page?: number } =>
    typeof search.page === "number" && search.page > 1 ? { page: search.page } : {},
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: ({ deps }) => getAccountOrders({ data: deps.page }),
  component: Orders,
  head: () => ({
    meta: [
      { title: "Your orders — Cliffs of Puff" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

// The stages a parcel is still moving through. Anything else is finished, one
// way or another, and does not want a live-looking badge next to it.
const LIVE = new Set(["paid", "processing", "ready", "shipped"]);

const longDate = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

function Orders() {
  const { customer } = useAccount();
  const { orders, page, pages, total } = Route.useLoaderData();
  const pointsName = customer!.loyalty.pointsName;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AccountShell
        eyebrow="Your account"
        title="Orders"
        lede={
          total > 0
            ? `${total} order${total === 1 ? "" : "s"}, newest first. Tap any one to follow it.`
            : undefined
        }
      >
        {orders.length ? (
          <div className="space-y-3 sm:space-y-4">
            {orders.map((order) => (
              <Link
                key={order.orderNo}
                to="/account/orders/$orderNo"
                params={{ orderNo: order.orderNo }}
                className="group block border hair bg-surface transition-colors hover:border-ink"
              >
                {/* Header row: reference and status left, money right. On a
                    phone the money drops under the reference rather than
                    squeezing both onto one cramped line. */}
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b hair px-4 py-3.5 sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold">
                        {order.orderNo}
                      </span>
                      <span
                        className={`px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest ${
                          LIVE.has(order.status)
                            ? "bg-accent text-accent-foreground"
                            : order.status === "delivered"
                              ? "bg-ink text-primary-foreground"
                              : "border hair text-ink-muted"
                        }`}
                      >
                        {order.statusLabel}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-ink-muted">
                      {longDate(order.placedAt)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-display text-lg leading-none tabular-nums">
                      {formatPrice(order.total)}
                    </div>
                    <div className="mt-1 text-xs text-ink-muted">
                      {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>

                <div className="px-4 py-3.5 sm:px-5">
                  {/* What was in it, so an order is recognisable without
                      opening it — a list of numbers and dates is not. */}
                  <ul className="space-y-1">
                    {order.items.slice(0, 2).map((item, index) => (
                      <li
                        key={index}
                        className="truncate text-sm text-ink-muted"
                      >
                        <span className="font-mono text-xs">{item.quantity}×</span>{" "}
                        {item.name}
                      </li>
                    ))}
                    {order.items.length > 2 && (
                      <li className="text-xs text-ink-muted">
                        +{order.items.length - 2} more
                      </li>
                    )}
                  </ul>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                      {order.loyalty.earned > 0 && (
                        <span className={order.loyalty.confirmed ? "" : "text-ink-muted"}>
                          {order.loyalty.confirmed ? "Earned" : "Earning"}{" "}
                          <strong className="tabular-nums">
                            {order.loyalty.earned}
                          </strong>{" "}
                          {pointsName}
                        </span>
                      )}
                      {order.loyalty.redeemed > 0 && (
                        <span className="text-ink-muted">
                          Paid with{" "}
                          <strong className="tabular-nums">
                            {order.loyalty.redeemed}
                          </strong>{" "}
                          {pointsName}
                        </span>
                      )}
                    </div>
                    <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-widest underline underline-offset-4 group-hover:text-accent-foreground">
                      Track it <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}

            {pages > 1 && (
              <nav
                aria-label="Order history pages"
                className="flex items-center justify-between gap-3 pt-2"
              >
                <Link
                  to="/account/orders"
                  search={{ page: Math.max(1, page - 1) }}
                  disabled={page <= 1}
                  className={`inline-flex items-center gap-1.5 border hair px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                    page <= 1
                      ? "pointer-events-none opacity-40"
                      : "hover:bg-ink hover:text-primary-foreground"
                  }`}
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Newer
                </Link>
                <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                  {page} / {pages}
                </span>
                <Link
                  to="/account/orders"
                  search={{ page: Math.min(pages, page + 1) }}
                  disabled={page >= pages}
                  className={`inline-flex items-center gap-1.5 border hair px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                    page >= pages
                      ? "pointer-events-none opacity-40"
                      : "hover:bg-ink hover:text-primary-foreground"
                  }`}
                >
                  Older <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </nav>
            )}
          </div>
        ) : (
          <Panel flush>
            <EmptyState
              icon={Package}
              title="No orders yet"
              cta={{ to: "/shop", label: "Browse the shop" }}
            >
              Once you've ordered, every step from packed to delivered shows up
              here.
            </EmptyState>
          </Panel>
        )}
      </AccountShell>
      <Footer />
    </div>
  );
}
