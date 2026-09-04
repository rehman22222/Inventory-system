import React, { useCallback, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import toast from "react-hot-toast";
import {
  FiAward,
  FiChevronLeft,
  FiChevronRight,
  FiMail,
  FiMapPin,
  FiPhone,
  FiRefreshCw,
  FiSearch,
  FiShoppingBag,
  FiSlash,
  FiUnlock,
  FiUser,
  FiX,
} from "react-icons/fi";
import {
  adjustCustomerPoints,
  getOnlineCustomer,
  getOnlineCustomers,
  recalculateCustomerPoints,
  setCustomerStatus,
} from "../../features/onlineStoreSlice";

/* The shop's view of the people who buy from its website.
 *
 * Read-heavy on purpose. Almost everything here is somebody else's record: the
 * shop can look, can block an account and can move a balance by hand, and that
 * last one is the only thing on this screen that creates value out of nothing —
 * so it asks for a reason, and the reason is shown to the customer.
 */

const money = (value) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const whole = (value) => Number(value || 0).toLocaleString();

const shortDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

const fullDate = (value) => (value ? new Date(value).toLocaleString() : "—");

const SORTS = [
  { id: "newest", label: "Newest first" },
  { id: "spend", label: "Highest spend" },
  { id: "orders", label: "Most orders" },
  { id: "points", label: "Most points" },
];

// What each kind of ledger row looks like at a glance. The sign is carried by
// the number itself, so the colour only has to say "good news / bad news".
const LEDGER_STYLE = {
  earn: { label: "Earned", tone: "text-success" },
  bonus: { label: "Bonus", tone: "text-success" },
  redeem: { label: "Spent", tone: "text-base-content/70" },
  refund: { label: "Returned", tone: "text-info" },
  reverse: { label: "Removed", tone: "text-error" },
  adjust: { label: "Adjusted", tone: "text-warning" },
  expire: { label: "Expired", tone: "text-base-content/50" },
};

export default function CustomersTab() {
  const dispatch = useDispatch();
  const { customers, isActing } = useSelector((state) => state.onlineStore);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState("");

  const load = useCallback(
    (overrides = {}) => {
      dispatch(
        getOnlineCustomers({ search, status, sort, page, ...overrides }),
      );
    },
    [dispatch, search, status, sort, page],
  );

  // Debounced so typing a name is one request when they stop, not one per
  // keystroke against a collection that could be large.
  useEffect(() => {
    const timer = setTimeout(() => load(), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const summary = customers.summary;

  return (
    <div className="space-y-5">
      {summary && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard
            icon={FiUser}
            label="Accounts"
            value={whole(summary.customers)}
            hint="People signed up on the website"
          />
          <StatCard
            icon={FiShoppingBag}
            label="Orders placed"
            value={whole(summary.orders)}
            hint="From account holders"
          />
          <StatCard
            icon={FiShoppingBag}
            label="Lifetime spend"
            value={`€${money(summary.spend)}`}
            hint="Across every account"
          />
          <StatCard
            icon={FiAward}
            label={`${summary.pointsName || "Points"} outstanding`}
            value={whole(summary.pointsOutstanding)}
            /* The figure that turns a rewards programme into a decision: what
               it would cost if every point were spent tomorrow. */
            hint={
              summary.loyaltyEnabled
                ? `Worth €${money(summary.liability)} if all redeemed`
                : "Rewards are switched off"
            }
            accent
          />
        </div>
      )}

      {/* Search gets its own full-width row on a phone; the two filters share
          the next one and the refresh sits beside them. Four stacked full-width
          controls is a lot of screen spent before the list even starts. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
        <label className="input input-sm input-bordered col-span-2 flex items-center gap-2 sm:col-span-1">
          <FiSearch className="shrink-0 text-base-content/50" />
          <input
            type="search"
            className="grow"
            placeholder="Search name, email or phone"
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
          />
        </label>
        <select
          className="select select-sm select-bordered"
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value);
          }}
        >
          <option value="">All accounts</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
        </select>
        <select
          className="select select-sm select-bordered"
          value={sort}
          onChange={(event) => {
            setPage(1);
            setSort(event.target.value);
          }}
        >
          {SORTS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          className="btn btn-sm col-span-2 gap-2 sm:col-span-1"
          onClick={() => load()}
        >
          <FiRefreshCw /> Refresh
        </button>
      </div>

      {/* One list, two shapes.
          An eight-column table is the right way to compare customers on a wide
          screen and completely wrong on a phone, where it becomes a sideways
          scroll with the name column off the edge. Below lg the same rows are
          drawn as cards, each one a tap target that opens the same panel. */}
      <div className="space-y-3 lg:hidden">
        {customers.rows.map((customer) => (
          <button
            key={customer._id}
            type="button"
            onClick={() => setOpenId(customer._id)}
            className="w-full rounded-xl border bg-base-100 p-4 text-left transition-colors hover:border-primary"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{customer.name}</span>
                  {customer.status === "blocked" && (
                    <span className="badge badge-xs badge-error">blocked</span>
                  )}
                  {customer.tier && (
                    <span className="badge badge-xs badge-outline">
                      {customer.tier.name}
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-base-content/50">
                  {customer.email}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-mono text-sm font-semibold tabular-nums">
                  {whole(customer.points?.balance)}
                </div>
                <div className="text-[11px] text-base-content/50">
                  {summary?.pointsName || "points"}
                </div>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-2 border-t pt-3 text-center">
              <div>
                <dt className="text-[11px] text-base-content/50">Orders</dt>
                <dd className="font-medium tabular-nums">
                  {whole(customer.stats?.orders)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-base-content/50">Spend</dt>
                <dd className="font-medium tabular-nums">
                  €{money(customer.stats?.spend)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-base-content/50">Joined</dt>
                <dd className="font-medium">{shortDate(customer.createdAt)}</dd>
              </div>
            </dl>
          </button>
        ))}
        {!customers.rows.length && (
          <div className="rounded-xl border bg-base-100 py-10 text-center">
            <div className="text-base-content/50">
              {search || status
                ? "No accounts match that."
                : "Nobody has created an account yet."}
            </div>
          </div>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border bg-base-100 lg:block">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Joined</th>
              <th className="text-right">Orders</th>
              <th className="text-right">Spend</th>
              <th className="text-right">
                {summary?.pointsName
                  ? summary.pointsName.charAt(0).toUpperCase() +
                    summary.pointsName.slice(1)
                  : "Points"}
              </th>
              <th>Tier</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {customers.rows.map((customer) => (
              <tr key={customer._id} className="hover">
                <td>
                  <div className="font-medium">{customer.name}</div>
                  <div className="text-xs text-base-content/50">
                    {customer.email}
                  </div>
                </td>
                <td className="whitespace-nowrap text-sm">
                  {shortDate(customer.createdAt)}
                </td>
                <td className="text-right">{whole(customer.stats?.orders)}</td>
                <td className="text-right">€{money(customer.stats?.spend)}</td>
                <td className="text-right">
                  <div className="font-mono font-semibold">
                    {whole(customer.points?.balance)}
                  </div>
                  {customer.points?.pending > 0 && (
                    <div
                      className="text-xs text-base-content/50"
                      title="Earned on orders that have not been delivered yet"
                    >
                      +{whole(customer.points.pending)} pending
                    </div>
                  )}
                </td>
                <td>
                  {customer.tier ? (
                    <span className="badge badge-sm badge-outline">
                      {customer.tier.name}
                    </span>
                  ) : (
                    <span className="text-base-content/30">—</span>
                  )}
                </td>
                <td>
                  <span
                    className={`badge badge-sm ${
                      customer.status === "blocked"
                        ? "badge-error"
                        : "badge-success badge-outline"
                    }`}
                  >
                    {customer.status}
                  </span>
                </td>
                <td className="text-right">
                  <button
                    className="btn btn-xs"
                    onClick={() => setOpenId(customer._id)}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
            {!customers.rows.length && (
              <tr>
                <td colSpan={8} className="py-10 text-center">
                  <div className="text-base-content/50">
                    {search || status
                      ? "No accounts match that."
                      : "Nobody has created an account yet."}
                  </div>
                  {!search && !status && (
                    <div className="mt-1 text-xs text-base-content/40">
                      Accounts appear here as soon as shoppers sign up on the
                      website.
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {customers.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            className="btn btn-sm btn-ghost gap-1"
            disabled={customers.page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            <FiChevronLeft /> Previous
          </button>
          <span className="text-sm text-base-content/60">
            Page {customers.page} of {customers.pages} · {whole(customers.total)}{" "}
            account{customers.total === 1 ? "" : "s"}
          </span>
          <button
            className="btn btn-sm btn-ghost gap-1"
            disabled={customers.page >= customers.pages}
            onClick={() => setPage((current) => current + 1)}
          >
            Next <FiChevronRight />
          </button>
        </div>
      )}

      {openId && (
        <CustomerPanel
          customerId={openId}
          isActing={isActing}
          pointsName={summary?.pointsName || "points"}
          onClose={() => setOpenId("")}
          onChanged={() => load()}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint, accent }) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent ? "border-primary/30 bg-primary/5" : "bg-base-100"
      }`}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-base-content/50">
        <Icon className="shrink-0" /> {label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold tabular-nums">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-base-content/50">{hint}</div>}
    </div>
  );
}

/* One customer, in full. A slide-over rather than a route, because the shop is
 * usually working through a list and being thrown onto a different page for
 * every person they check loses their place in it. */
function CustomerPanel({ customerId, isActing, pointsName, onClose, onChanged }) {
  const dispatch = useDispatch();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pointsInput, setPointsInput] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await dispatch(getOnlineCustomer(customerId));
    if (result.error) toast.error(result.payload);
    else setData(result.payload);
    setLoading(false);
  }, [dispatch, customerId]);

  useEffect(() => {
    load();
  }, [load]);

  // Escape closes it — a panel over a list should never be a trap.
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const customer = data?.customer;

  const adjust = async () => {
    const points = Math.trunc(Number(pointsInput));
    if (!Number.isFinite(points) || points === 0) {
      return toast.error("Enter how many points to add or take away");
    }
    if (!reason.trim()) {
      return toast.error("Please say why — the customer can see this");
    }
    const result = await dispatch(
      adjustCustomerPoints({ id: customerId, points, reason: reason.trim() }),
    );
    if (result.error) return toast.error(result.payload);
    toast.success(result.payload.message);
    setPointsInput("");
    setReason("");
    load();
    onChanged();
  };

  const toggleBlocked = async () => {
    const next = customer.status === "blocked" ? "active" : "blocked";
    if (
      next === "blocked" &&
      !window.confirm(
        `Block ${customer.name}? They won't be able to sign in or order, but their history is kept.`,
      )
    ) {
      return;
    }
    const result = await dispatch(
      setCustomerStatus({ id: customerId, status: next }),
    );
    if (result.error) return toast.error(result.payload);
    toast.success(result.payload.message);
    load();
    onChanged();
  };

  const recalculate = async () => {
    const result = await dispatch(recalculateCustomerPoints(customerId));
    if (result.error) return toast.error(result.payload);
    toast.success(result.payload.message);
    load();
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-stretch">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      <aside className="relative flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-2xl bg-base-100 shadow-2xl sm:h-full sm:max-h-none sm:max-w-2xl sm:rounded-none">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-base-100 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-bold">
              {loading ? "Loading…" : customer?.name}
            </h2>
            {customer && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/60">
                <span className="inline-flex items-center gap-1">
                  <FiMail /> {customer.email}
                </span>
                {customer.phone && (
                  <span className="inline-flex items-center gap-1">
                    <FiPhone /> {customer.phone}
                  </span>
                )}
              </div>
            )}
          </div>
          <button className="btn btn-sm btn-ghost btn-circle" onClick={onClose}>
            <FiX />
          </button>
        </header>

        {loading || !customer ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <span className="loading loading-spinner loading-lg" />
          </div>
        ) : (
          <div className="space-y-5 p-4 sm:p-5">
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MiniStat label="Orders" value={whole(customer.stats.orders)} />
              <MiniStat label="Spend" value={`€${money(customer.stats.spend)}`} />
              <MiniStat
                label={`${pointsName} balance`}
                value={whole(customer.points.balance)}
              />
              <MiniStat
                label="Pending"
                value={whole(customer.points.pending)}
                hint="Not yet delivered"
              />
            </section>

            {customer.tier && (
              <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center gap-2">
                  <FiAward className="text-primary" />
                  <span className="font-semibold">{customer.tier.name}</span>
                  {customer.tier.multiplier > 1 && (
                    <span className="badge badge-sm badge-primary">
                      {customer.tier.multiplier}× points
                    </span>
                  )}
                </div>
                {customer.tier.perk && (
                  <p className="mt-1 text-sm text-base-content/70">
                    {customer.tier.perk}
                  </p>
                )}
                {customer.nextTier && (
                  <p className="mt-2 text-xs text-base-content/60">
                    {whole(
                      Math.max(
                        0,
                        customer.nextTier.threshold - customer.points.lifetime,
                      ),
                    )}{" "}
                    more lifetime {pointsName} to reach{" "}
                    <strong>{customer.nextTier.name}</strong>
                  </p>
                )}
              </section>
            )}

            <section className="rounded-xl border bg-base-100 p-4">
              <h3 className="font-semibold">Account</h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Row label="Joined" value={fullDate(customer.createdAt)} />
                <Row label="Last signed in" value={fullDate(customer.lastLoginAt)} />
                <Row
                  label="Last order"
                  value={fullDate(customer.stats.lastOrderAt)}
                />
                <Row
                  label="Marketing"
                  value={customer.marketingOptIn ? "Opted in" : "Not opted in"}
                />
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={`btn btn-sm gap-2 ${
                    customer.status === "blocked" ? "btn-success" : "btn-error btn-outline"
                  }`}
                  disabled={isActing}
                  onClick={toggleBlocked}
                >
                  {customer.status === "blocked" ? <FiUnlock /> : <FiSlash />}
                  {customer.status === "blocked" ? "Reactivate account" : "Block account"}
                </button>
                <button
                  className="btn btn-sm btn-ghost gap-2"
                  disabled={isActing}
                  onClick={recalculate}
                  title="Recompute the balance from the statement below. Only needed if the two ever disagree."
                >
                  <FiRefreshCw /> Recalculate balance
                </button>
              </div>
            </section>

            {customer.addresses?.length > 0 && (
              <section className="rounded-xl border bg-base-100 p-4">
                <h3 className="flex items-center gap-2 font-semibold">
                  <FiMapPin /> Saved addresses
                </h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {customer.addresses.map((address, index) => (
                    <div
                      key={address._id || index}
                      className="rounded-lg border bg-base-200/40 p-3 text-sm"
                    >
                      {address.isDefault && (
                        <span className="badge badge-xs badge-primary mb-1">
                          Default
                        </span>
                      )}
                      {address.label && (
                        <div className="font-medium">{address.label}</div>
                      )}
                      <div className="text-base-content/70">
                        {[
                          address.line1,
                          address.line2,
                          address.city,
                          address.region,
                          address.postcode,
                          address.country,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-xl border bg-base-100 p-4">
              <h3 className="font-semibold">Orders</h3>
              {data.orders.length ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="table table-xs">
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Date</th>
                        <th>Status</th>
                        <th className="text-right">Total</th>
                        <th className="text-right">{pointsName}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.map((order) => (
                        <tr key={order._id}>
                          <td className="font-mono">{order.orderNo}</td>
                          <td className="whitespace-nowrap">
                            {shortDate(order.createdAt)}
                          </td>
                          <td>
                            <span className="badge badge-xs">
                              {order.status.replaceAll("_", " ")}
                            </span>
                          </td>
                          <td className="text-right">€{money(order.total)}</td>
                          <td className="text-right tabular-nums">
                            {order.loyalty.earned > 0 && (
                              <span className="text-success">
                                +{whole(order.loyalty.earned)}
                              </span>
                            )}
                            {order.loyalty.redeemed > 0 && (
                              <span className="ml-1 text-base-content/60">
                                −{whole(order.loyalty.redeemed)}
                              </span>
                            )}
                            {!order.loyalty.earned && !order.loyalty.redeemed && (
                              <span className="text-base-content/30">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 text-sm text-base-content/50">
                  No orders on this account yet.
                </p>
              )}
            </section>

            <section className="rounded-xl border bg-base-100 p-4">
              <h3 className="font-semibold">Adjust {pointsName}</h3>
              <p className="mt-1 text-xs text-base-content/60">
                A goodwill gesture, a correction, a prize. The reason is shown to
                the customer on their own statement, and this is recorded against
                your name.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[7rem_1fr_auto] sm:items-end">
                <label className="form-control">
                  <span className="label-text text-xs">Points</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="input input-sm input-bordered w-full"
                    placeholder="e.g. 250"
                    value={pointsInput}
                    onChange={(event) => setPointsInput(event.target.value)}
                  />
                </label>
                <label className="form-control">
                  <span className="label-text text-xs">Reason</span>
                  <input
                    type="text"
                    className="input input-sm input-bordered w-full"
                    placeholder="Goodwill — delayed delivery"
                    maxLength={300}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <button
                  className="btn btn-sm btn-primary w-full sm:w-auto"
                  disabled={isActing}
                  onClick={adjust}
                >
                  Apply
                </button>
              </div>
              <p className="mt-2 text-xs text-base-content/50">
                Use a negative number to take points away.
              </p>
            </section>

            <section className="rounded-xl border bg-base-100 p-4">
              <h3 className="font-semibold">{pointsName} statement</h3>
              {data.ledger.length ? (
                <div className="mt-2 overflow-x-auto">
                  <table className="table table-xs">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>What</th>
                        <th className="text-right">Points</th>
                        <th className="text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ledger.map((entry) => {
                        const style =
                          LEDGER_STYLE[entry.kind] || {
                            label: entry.kind,
                            tone: "",
                          };
                        return (
                          <tr key={entry._id}>
                            <td className="whitespace-nowrap">
                              {shortDate(entry.at)}
                            </td>
                            <td>
                              <div className="flex items-center gap-2">
                                <span className={style.tone}>{style.label}</span>
                                {entry.status === "pending" && (
                                  <span
                                    className="badge badge-xs badge-warning"
                                    title="Not spendable until the order is delivered"
                                  >
                                    pending
                                  </span>
                                )}
                                {entry.status === "reversed" && (
                                  <span className="badge badge-xs">reversed</span>
                                )}
                              </div>
                              <div className="text-xs text-base-content/50">
                                {entry.reason}
                                {entry.byName ? ` · ${entry.byName}` : ""}
                              </div>
                            </td>
                            <td
                              className={`text-right font-mono tabular-nums ${
                                entry.points > 0 ? "text-success" : ""
                              }`}
                            >
                              {entry.points > 0 ? "+" : ""}
                              {whole(entry.points)}
                            </td>
                            <td className="text-right font-mono tabular-nums text-base-content/60">
                              {entry.status === "confirmed"
                                ? whole(entry.balanceAfter)
                                : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-2 text-sm text-base-content/50">
                  Nothing on this statement yet.
                </p>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}

function MiniStat({ label, value, hint }) {
  return (
    <div className="rounded-lg border bg-base-200/40 p-3">
      <div className="text-xs capitalize text-base-content/50">{label}</div>
      <div className="font-display text-lg font-bold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-base-content/40">{hint}</div>}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <>
      <dt className="text-base-content/50">{label}</dt>
      <dd className="text-right">{value}</dd>
    </>
  );
}
