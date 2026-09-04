import { createFileRoute, Link } from "@tanstack/react-router";
import { Award, ChevronLeft, ChevronRight, Sparkles, TrendingUp } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AccountShell, EmptyState, Panel } from "@/components/account/AccountShell";
import { getAccountRewards, type RewardEntry } from "@/lib/account-api";
import { requireAccount } from "@/lib/require-account";
import { formatPrice } from "@/lib/format";

export const Route = createFileRoute("/account/rewards")({
  beforeLoad: requireAccount,
  validateSearch: (search: Record<string, unknown>): { page?: number } =>
    typeof search.page === "number" && search.page > 1 ? { page: search.page } : {},
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: ({ deps }) => getAccountRewards({ data: deps.page }),
  component: Rewards,
  head: () => ({
    meta: [
      { title: "Your rewards — Cliffs of Puff" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

// How each movement is described to the person it happened to. Plain words, not
// the ledger's own vocabulary: "reverse" is a database word, "taken back" is
// what actually happened to them.
const KIND_LABEL: Record<string, string> = {
  earn: "Earned",
  bonus: "Bonus",
  redeem: "Spent",
  refund: "Returned to you",
  reverse: "Taken back",
  adjust: "Adjusted by us",
  expire: "Expired",
};

const stamp = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

/** Turn one rule into the sentence a shopper would say it in. */
const describeOffer = (offer: {
  scope: string;
  earnMode: string;
  value: number;
  minSpend: number;
}) => {
  const where =
    {
      all: "everything",
      category: "selected categories",
      product: "selected products",
      best_sellers: "our best sellers",
      brand: "one brand",
      order: "your order",
    }[offer.scope] || "selected items";

  const how =
    offer.earnMode === "multiplier"
      ? `${offer.value}× points`
      : offer.earnMode === "per_unit"
        ? `${offer.value} points per item`
        : offer.earnMode === "fixed"
          ? `${offer.value} bonus points`
          : `${offer.value} points per €1`;

  const floor = offer.minSpend > 0 ? ` when you spend ${formatPrice(offer.minSpend)}` : "";
  return `${how} on ${where}${floor}`;
};

function Rewards() {
  const { summary, entries, offers, terms, page, pages } = Route.useLoaderData();

  if (!summary.enabled) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <AccountShell eyebrow="Your account" title="Rewards">
          <Panel flush>
            <EmptyState
              icon={Award}
              title="No rewards programme running"
              cta={{ to: "/shop", label: "Browse the shop" }}
            >
              There's nothing to collect at the moment. If that changes, it'll
              show up here.
            </EmptyState>
          </Panel>
        </AccountShell>
        <Footer />
      </div>
    );
  }

  const canSpend =
    summary.minRedeemPoints === 0 || summary.balance >= summary.minRedeemPoints;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <AccountShell
        eyebrow={summary.programName}
        title="Rewards"
        lede={`Collect ${summary.pointsName} on everything you buy and spend them at checkout.`}
      >
        <div className="space-y-5 sm:space-y-6">
          {/* The balance, as the loudest thing on the page. */}
          <section className="border hair bg-ink text-primary-foreground">
            <div className="px-4 py-6 sm:px-6 sm:py-7">
              <div className="font-mono text-[10px] uppercase tracking-widest opacity-70">
                Your balance
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
                <span className="font-display text-5xl leading-none tabular-nums sm:text-6xl">
                  {summary.balance.toLocaleString()}
                </span>
                <span className="pb-1.5 text-base opacity-80">
                  {summary.pointsName}
                </span>
              </div>
              <p className="mt-3 text-sm opacity-80">
                {canSpend ? (
                  <>Worth {formatPrice(summary.value)} off your next order.</>
                ) : (
                  <>
                    You can start spending at{" "}
                    {summary.minRedeemPoints.toLocaleString()}{" "}
                    {summary.pointsName} — {(summary.minRedeemPoints - summary.balance).toLocaleString()}{" "}
                    to go.
                  </>
                )}
              </p>
            </div>

            {(summary.pending > 0 || summary.tier) && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/15 px-4 py-3.5 text-sm sm:px-6">
                {summary.pending > 0 && (
                  <span className="inline-flex items-center gap-1.5 opacity-80">
                    <Sparkles className="h-3.5 w-3.5" />
                    {summary.pending.toLocaleString()} on the way
                  </span>
                )}
                {summary.tier && (
                  <span className="inline-flex items-center gap-1.5">
                    <Award className="h-3.5 w-3.5" />
                    {summary.tier.name}
                    {summary.tier.multiplier > 1 &&
                      ` · ${summary.tier.multiplier}× on everything`}
                  </span>
                )}
              </div>
            )}
          </section>

          {summary.tiers.length > 0 && (
            <Panel
              title="Tiers"
              description={`Reached on the ${summary.pointsName} you've earned in total — spending them never sets you back.`}
              flush
            >
              <ol className="divide-y hair">
                {summary.tiers.map((tier) => {
                  const reached = summary.lifetime >= tier.threshold;
                  const current = summary.tier?.name === tier.name;
                  return (
                    <li
                      key={tier.name}
                      className={`flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5 ${
                        reached ? "" : "opacity-45"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-base leading-tight sm:text-lg">
                            {tier.name}
                          </span>
                          {current && (
                            <span className="bg-accent px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-accent-foreground">
                              You
                            </span>
                          )}
                        </div>
                        {tier.perk && (
                          <p className="mt-0.5 text-sm text-ink-muted">{tier.perk}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                        <div className="tabular-nums">
                          {tier.threshold.toLocaleString()}
                        </div>
                        {tier.multiplier > 1 && <div>{tier.multiplier}× earning</div>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Panel>
          )}

          {offers.length > 0 && (
            <Panel
              title="Earning more"
              description="What's on offer right now, on top of the standard rate."
              flush
            >
              <ul className="divide-y hair sm:grid sm:grid-cols-2 sm:divide-y-0">
                {offers.map((offer, index) => (
                  <li
                    key={index}
                    className={`flex items-start gap-3 px-4 py-3.5 sm:px-5 ${
                      index % 2 === 0 ? "sm:border-r hair" : ""
                    } ${index >= 2 ? "sm:border-t" : ""}`}
                  >
                    <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-accent-foreground" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-snug">
                        {offer.name}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {describeOffer(offer)}
                      </p>
                      {offer.endsAt && (
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-ink-muted">
                          until {stamp(offer.endsAt)}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Your statement" flush>
            {entries.length ? (
              <>
                <ul className="divide-y hair">
                  {entries.map((entry) => (
                    <StatementRow
                      key={entry.id}
                      entry={entry}
                      pointsName={summary.pointsName}
                    />
                  ))}
                </ul>
                {pages > 1 && (
                  <nav
                    aria-label="Statement pages"
                    className="flex items-center justify-between gap-3 border-t hair px-4 py-3.5 sm:px-5"
                  >
                    <Link
                      to="/account/rewards"
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
                      to="/account/rewards"
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
              </>
            ) : (
              <EmptyState
                icon={Award}
                title={`No ${summary.pointsName} yet`}
                cta={{ to: "/shop", label: "Start earning" }}
              >
                You'll collect {summary.pointsName} on everything you buy, and
                they'll be listed here.
              </EmptyState>
            )}
          </Panel>

          {terms && (
            <Panel title="The small print">
              <div className="space-y-3 text-sm text-ink-muted">
                {terms.split(/\n{2,}/).map((block, index) =>
                  block.startsWith("## ") ? (
                    <h3
                      key={index}
                      className="pt-2 font-display text-base leading-tight tracking-tight text-ink"
                    >
                      {block.slice(3)}
                    </h3>
                  ) : (
                    <p key={index}>{block}</p>
                  ),
                )}
              </div>
            </Panel>
          )}
        </div>
      </AccountShell>
      <Footer />
    </div>
  );
}

function StatementRow({
  entry,
  pointsName,
}: {
  entry: RewardEntry;
  pointsName: string;
}) {
  const positive = entry.points > 0;
  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {KIND_LABEL[entry.kind] || entry.kind}
          </span>
          {entry.status === "pending" && (
            <span
              className="border hair px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-ink-muted"
              title="Lands in your balance once the order is delivered"
            >
              On the way
            </span>
          )}
          {entry.status === "reversed" && (
            <span className="border hair px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-ink-muted">
              Reversed
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-ink-muted">
          {stamp(entry.at)}
          {entry.reason ? ` · ${entry.reason}` : ""}
        </div>
        {/* Why an order earned what it earned, line by line. Only shown where
            more than one thing contributed — a single line just repeats the
            total. */}
        {entry.breakdown.length > 1 && (
          <ul className="mt-1.5 space-y-0.5">
            {entry.breakdown.map((row, index) => (
              <li key={index} className="font-mono text-[10px] text-ink-muted">
                {row.name}
                {row.rule ? ` · ${row.rule}` : ""} — {row.points}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="shrink-0 text-right">
        <div
          className={`font-display text-base tabular-nums ${
            entry.status === "reversed"
              ? "text-ink-muted line-through"
              : positive
                ? "text-ink"
                : "text-ink-muted"
          }`}
        >
          {positive ? "+" : ""}
          {entry.points.toLocaleString()}
        </div>
        {entry.status === "confirmed" && (
          <div className="mt-0.5 font-mono text-[10px] tabular-nums text-ink-muted">
            {entry.balanceAfter.toLocaleString()} {pointsName}
          </div>
        )}
      </div>
    </li>
  );
}
