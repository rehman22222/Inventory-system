import { createFileRoute } from "@tanstack/react-router";
import { Award, ExternalLink, MessageSquare, Truck } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AccountShell, Panel } from "@/components/account/AccountShell";
import { OrderTracker } from "@/components/account/OrderTracker";
import { getAccountOrder } from "@/lib/account-api";
import { useAccount } from "@/lib/account-context";
import { requireAccount } from "@/lib/require-account";
import { formatPrice } from "@/lib/format";

export const Route = createFileRoute("/account/orders/$orderNo")({
  beforeLoad: requireAccount,
  // Scoped to this customer on the server. An order number is short and
  // guessable, and looking one up must never be enough to read somebody else's
  // delivery address.
  loader: ({ params }) => getAccountOrder({ data: params.orderNo }),
  component: OrderDetailPage,
  head: ({ params }) => ({
    meta: [
      { title: `Order ${params.orderNo} — Cliffs of Puff` },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const stamp = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function OrderDetailPage() {
  const order = Route.useLoaderData();
  const { customer } = useAccount();
  const pointsName = customer!.loyalty.pointsName;
  const address = order.shippingAddress || {};

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AccountShell
        back={{ to: "/account/orders", label: "All orders" }}
        eyebrow={`Ordered ${stamp(order.placedAt)}`}
        title={order.orderNo}
      >
        <div className="space-y-5 sm:space-y-6">
          {/* The answer to "where is it?", first and largest. */}
          <OrderTracker
            steps={order.tracker.steps}
            cancelled={order.tracker.cancelled}
            statusLabel={order.tracker.statusLabel}
          />

          {(order.tracking.carrier ||
            order.tracking.number ||
            order.tracking.estimate) && (
            <Panel title="Delivery">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {order.tracking.carrier && (
                  <Detail label="Carrier" value={order.tracking.carrier} />
                )}
                {order.tracking.number && (
                  <Detail label="Tracking" value={order.tracking.number} mono />
                )}
                {order.tracking.estimate && (
                  <Detail label="Expected" value={order.tracking.estimate} />
                )}
              </dl>
              {order.tracking.url && (
                <a
                  href={order.tracking.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="btn-primary mt-4 w-full sm:w-auto"
                >
                  <Truck className="h-4 w-4" /> Track with the carrier
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </Panel>
          )}

          {/* Notes the shop wrote for this customer. Only the notes — the staff
              names and internal steps stay on the shop's side of the counter. */}
          {order.updates.length > 0 && (
            <Panel title="Updates from us" flush>
              <ol className="divide-y hair">
                {[...order.updates].reverse().map((update, index) => (
                  <li key={index} className="flex gap-3 px-4 py-3.5 sm:px-5">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center border hair text-ink-muted">
                      <MessageSquare className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                        {update.label} · {stamp(update.at)}
                      </div>
                      <p className="mt-1 text-sm">{update.note}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          <Panel title="What you ordered" flush>
            <ul className="divide-y hair">
              {order.items.map((item, index) => (
                <li
                  key={`${item.name}-${index}`}
                  className="flex items-start justify-between gap-4 px-4 py-3.5 sm:px-5"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-snug">
                      {item.name}
                    </div>
                    {item.brand && (
                      <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                        {item.brand}
                      </div>
                    )}
                    <div className="mt-1 font-mono text-xs text-ink-muted">
                      {item.quantity} × {formatPrice(item.price)}
                    </div>
                  </div>
                  <span className="shrink-0 font-display text-sm tabular-nums">
                    {formatPrice(item.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="space-y-2 border-t hair px-4 py-4 text-sm sm:px-5">
              <Line label="Subtotal" value={formatPrice(order.subtotal)} />
              {order.discount > 0 && (
                <Line
                  label={order.voucher ? `Voucher ${order.voucher.code}` : "Discount"}
                  value={`−${formatPrice(order.discount)}`}
                  sale
                />
              )}
              <Line
                label="Delivery"
                value={order.shipping > 0 ? formatPrice(order.shipping) : "Free"}
              />
              {order.loyalty.redeemed > 0 && (
                <Line
                  label={`${order.loyalty.redeemed.toLocaleString()} ${pointsName}`}
                  value={`−${formatPrice(order.loyalty.redeemedValue)}`}
                  sale
                />
              )}
              <div className="flex items-baseline justify-between border-t hair pt-3">
                <span className="font-display text-lg">Total</span>
                <span className="font-display text-lg tabular-nums">
                  {formatPrice(order.total)}
                </span>
              </div>
            </dl>
          </Panel>

          {order.loyalty.earned > 0 && (
            <div className="flex items-start gap-3 border border-accent bg-accent/15 px-4 py-4 sm:px-5">
              <Award className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="text-sm">
                <div className="font-medium">
                  {order.loyalty.earned.toLocaleString()} {pointsName}{" "}
                  {order.loyalty.confirmed ? "earned" : "on the way"}
                </div>
                <p className="mt-0.5 text-ink-muted">
                  {order.loyalty.confirmed
                    ? "These are on your account and ready to spend."
                    : "They'll land in your balance once this order is delivered."}
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
            <Panel title="Delivering to">
              <address className="text-sm not-italic leading-relaxed">
                <div className="font-medium">{order.customer.name}</div>
                {[
                  address.line1,
                  address.line2,
                  address.city,
                  address.region,
                  address.postcode,
                  address.country,
                ]
                  .filter(Boolean)
                  .map((line, index) => (
                    <div key={index} className="text-ink-muted">
                      {line}
                    </div>
                  ))}
                {order.customer.phone && (
                  <div className="mt-2 text-ink-muted">{order.customer.phone}</div>
                )}
              </address>
            </Panel>

            <Panel title="Payment">
              <div className="text-sm">
                <div className="font-medium">
                  {order.payment.method === "cash_on_delivery"
                    ? "Pick & Pay"
                    : order.payment.method || "—"}
                </div>
                <div className="mt-0.5 capitalize text-ink-muted">
                  {order.payment.status}
                </div>
                {order.note && (
                  <div className="mt-4 border-t hair pt-3">
                    <div className="eyebrow">Your note</div>
                    <p className="mt-1 text-ink-muted">{order.note}</p>
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </div>
      </AccountShell>
      <Footer />
    </div>
  );
}

function Line({
  label,
  value,
  sale,
}: {
  label: string;
  value: string;
  sale?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${
        sale ? "text-[color:var(--sale)]" : ""
      }`}
    >
      <dt className={sale ? "" : "text-ink-muted"}>{label}</dt>
      <dd className="shrink-0 tabular-nums">{value}</dd>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className={`mt-1 break-words text-sm ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
