import React, { useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import toast from "react-hot-toast";
import {
  FiCheck,
  FiPackage,
  FiTruck,
  FiHome,
  FiX,
  FiSlash,
  FiAward,
} from "react-icons/fi";
import { setOrderStatus } from "../../features/onlineStoreSlice";

/* Moving one order along, with everything that goes with the move.
 *
 * The shop does not "change a status" — it packs a parcel, hands it to a
 * courier and writes the tracking number down. So the note and the tracking
 * details are part of the same action, not a second screen: the moment you mark
 * it dispatched is the moment you have the reference in your hand.
 *
 * Everything typed here is shown to the CUSTOMER on their own order page. The
 * placeholder text says so, because a note written as an internal shorthand and
 * then published to a shopper is a small, avoidable embarrassment.
 */

// The steps, in the order the shop works through them, with the word the
// customer reads. The stored value differs from the label for "shipped" on
// purpose — see the order model.
export const FULFILMENT_STEPS = [
  { status: "processing", label: "Being prepared", icon: FiPackage },
  { status: "ready", label: "Ready to dispatch", icon: FiCheck },
  { status: "shipped", label: "Dispatched", icon: FiTruck },
  { status: "delivered", label: "Delivered", icon: FiHome },
];

// What a given status is allowed to become. Mirrors the server's own table, so
// a button is never offered for a move the API will refuse.
const NEXT_STATUSES = {
  pending_payment: ["paid", "cancelled"],
  paid: ["processing", "ready", "cancelled", "refunded"],
  processing: ["ready", "shipped", "delivered", "cancelled", "refunded"],
  ready: ["shipped", "delivered", "cancelled", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

const LABELS = {
  pending_payment: "Awaiting payment",
  paid: "Paid",
  processing: "Being prepared",
  ready: "Ready to dispatch",
  shipped: "Dispatched",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const statusLabel = (status) => LABELS[status] || status;

const money = (value) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** The little progress rail shown on the order row, and inside the modal. */
export function FulfilmentTrack({ order, compact = false }) {
  const stamps = useMemo(() => {
    const map = new Map();
    for (const entry of order.timeline || []) {
      if (!map.has(entry.status)) map.set(entry.status, entry.at);
    }
    return map;
  }, [order.timeline]);

  const terminal = ["cancelled", "refunded"].includes(order.status);
  const reached = FULFILMENT_STEPS.findIndex((s) => s.status === order.status);

  if (terminal) {
    return (
      <span className="badge badge-sm badge-error badge-outline gap-1">
        <FiSlash /> {statusLabel(order.status)}
      </span>
    );
  }

  return (
    <div className={`flex items-center ${compact ? "gap-1" : "gap-2"}`}>
      {FULFILMENT_STEPS.map((step, index) => {
        const done = stamps.has(step.status) || (reached >= 0 && index < reached);
        const current = step.status === order.status;
        return (
          <React.Fragment key={step.status}>
            {index > 0 && (
              <span
                className={`h-px flex-1 ${
                  done || current ? "bg-primary" : "bg-base-300"
                }`}
                style={{ minWidth: compact ? 10 : 18 }}
              />
            )}
            <span
              title={`${step.label}${
                stamps.get(step.status)
                  ? ` — ${new Date(stamps.get(step.status)).toLocaleString()}`
                  : ""
              }`}
              className={`grid place-items-center rounded-full border ${
                compact ? "h-5 w-5 text-[10px]" : "h-7 w-7 text-xs"
              } ${
                current
                  ? "border-primary bg-primary text-primary-content"
                  : done
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-base-300 text-base-content/30"
              }`}
            >
              <step.icon />
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function FulfilmentModal({ order, isActing, onClose }) {
  const dispatch = useDispatch();
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [tracking, setTracking] = useState({
    carrier: order.tracking?.carrier || "",
    number: order.tracking?.number || "",
    url: order.tracking?.url || "",
    estimate: order.tracking?.estimate || "",
  });

  const options = NEXT_STATUSES[order.status] || [];
  // Tracking fields only matter once something is actually leaving the shop.
  const showsTracking = ["shipped", "delivered"].includes(status);
  const undoing = ["cancelled", "refunded"].includes(status);

  const submit = async () => {
    if (!status) return toast.error("Choose what to mark it");
    if (
      undoing &&
      !window.confirm(
        `Mark ${order.orderNo} ${status}? Stock goes back on the shelf, any points earned are taken back, and any points spent are returned.`,
      )
    ) {
      return;
    }
    const result = await dispatch(
      setOrderStatus({
        id: order._id,
        status,
        note: note.trim(),
        tracking: showsTracking ? tracking : null,
      }),
    );
    if (result.error) return toast.error(result.payload);
    toast.success(`Order marked ${statusLabel(status).toLowerCase()}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      {/* A sheet rising from the bottom on a phone: it starts under the thumb
          that opened it, and the actions sit where that thumb already is.
          A centred dialog from sm up, where there is room for one. */}
      <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-base-100 shadow-2xl sm:max-h-[90vh] sm:max-w-xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
          <div>
            <h3 className="font-display text-lg font-bold">
              Order {order.orderNo}
            </h3>
            <p className="text-sm text-base-content/60">
              {order.customer?.name} · €{money(order.total)}
            </p>
          </div>
          <button className="btn btn-sm btn-ghost btn-circle" onClick={onClose}>
            <FiX />
          </button>
        </header>

        <div className="space-y-5 overflow-y-auto p-4 sm:p-5">
          <div className="rounded-xl border bg-base-200/40 p-4">
            <div className="mb-3 text-xs uppercase tracking-wide text-base-content/50">
              Where it is now
            </div>
            <FulfilmentTrack order={order} />
            <div className="mt-3 text-sm font-medium">
              {statusLabel(order.status)}
            </div>
          </div>

          {(order.loyalty?.earned > 0 || order.loyalty?.redeemed > 0) && (
            <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <FiAward className="mt-0.5 shrink-0 text-primary" />
              <div>
                {order.loyalty.earned > 0 && (
                  <div>
                    Earns <strong>{order.loyalty.earned}</strong> points
                    {order.loyalty.confirmedAt
                      ? " — already on their account."
                      : " once this order is delivered."}
                  </div>
                )}
                {order.loyalty.redeemed > 0 && (
                  <div>
                    Paid with <strong>{order.loyalty.redeemed}</strong> points
                    (€{money(order.loyalty.redeemedValue)} off).
                  </div>
                )}
              </div>
            </div>
          )}

          {options.length === 0 ? (
            <p className="rounded-lg bg-base-200/60 p-4 text-sm text-base-content/60">
              This order is finished — there is nowhere left for it to go.
            </p>
          ) : (
            <>
              <div>
                <span className="label-text">Mark it</span>
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  {options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setStatus(option)}
                      className={`rounded-lg border px-3 py-3 text-left text-sm transition-colors sm:py-2 ${
                        status === option
                          ? ["cancelled", "refunded"].includes(option)
                            ? "border-error bg-error/10"
                            : "border-primary bg-primary/10"
                          : "hover:bg-base-200"
                      }`}
                    >
                      {statusLabel(option)}
                    </button>
                  ))}
                </div>
              </div>

              {showsTracking && (
                <div className="grid gap-3 rounded-xl border bg-base-200/40 p-4 sm:grid-cols-2">
                  <div className="sm:col-span-2 text-xs uppercase tracking-wide text-base-content/50">
                    Tracking — all optional, all shown to the customer
                  </div>
                  <Field
                    label="Carrier"
                    value={tracking.carrier}
                    placeholder="An Post"
                    onChange={(value) =>
                      setTracking((current) => ({ ...current, carrier: value }))
                    }
                  />
                  <Field
                    label="Tracking number"
                    value={tracking.number}
                    placeholder="CP123456789IE"
                    onChange={(value) =>
                      setTracking((current) => ({ ...current, number: value }))
                    }
                  />
                  <Field
                    label="Tracking link"
                    value={tracking.url}
                    placeholder="https://…"
                    onChange={(value) =>
                      setTracking((current) => ({ ...current, url: value }))
                    }
                  />
                  <Field
                    label="Expected"
                    value={tracking.estimate}
                    placeholder="Tuesday"
                    onChange={(value) =>
                      setTracking((current) => ({ ...current, estimate: value }))
                    }
                  />
                </div>
              )}

              <label className="form-control">
                <span className="label-text">
                  Note for the customer (optional)
                </span>
                <textarea
                  className="textarea textarea-bordered"
                  rows={2}
                  maxLength={300}
                  placeholder="Going out with Monday's collection — sorry for the wait."
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
                <span className="label-text-alt text-base-content/50">
                  This appears on their order page and in the email we send.
                </span>
              </label>
            </>
          )}

          {order.timeline?.length > 1 && (
            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-base-content/50">
                History
              </div>
              <ol className="space-y-2 border-l pl-4">
                {[...order.timeline].reverse().map((entry, index) => (
                  <li key={index} className="relative text-sm">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-base-300" />
                    <div className="font-medium">{statusLabel(entry.status)}</div>
                    <div className="text-xs text-base-content/50">
                      {new Date(entry.at).toLocaleString()}
                      {entry.byName ? ` · ${entry.byName}` : ""}
                    </div>
                    {entry.note && (
                      <div className="mt-1 rounded bg-base-200/60 px-2 py-1 text-xs">
                        {entry.note}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {options.length > 0 && (
          <footer className="flex flex-col-reverse gap-2 border-t px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button
              className={`btn btn-sm ${undoing ? "btn-error" : "btn-primary"}`}
              disabled={isActing || !status}
              onClick={submit}
            >
              {status ? `Mark ${statusLabel(status).toLowerCase()}` : "Choose a step"}
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="form-control w-full">
      <span className="label-text text-xs">{label}</span>
      <input
        type="text"
        className="input input-sm input-bordered w-full"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
