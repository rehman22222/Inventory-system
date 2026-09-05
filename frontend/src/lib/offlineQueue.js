import axiosInstance from "./axios";
import {
  queueAdd,
  queueAll,
  queueRemove,
  queueCount,
  newClientRef,
} from "./offlineDb";

// Holds sales the till rang up with no network, and pushes them once it is back.
//
// The safety of this rests on `clientRef`: the server is idempotent on it, so
// replaying the queue after a half-finished sync can never charge a customer
// twice. That means the rule here is simple and safe — only drop a sale from the
// queue once the server has explicitly confirmed that ref. Anything else stays
// and is retried. A sale sitting in the queue twice costs nothing; a sale
// dropped without being stored is money gone.

const listeners = new Set();
let syncing = false;

const notify = async () => {
  const count = await queueCount().catch(() => 0);
  listeners.forEach((listener) => listener({ count, syncing }));
};

// Subscribe to queue depth / syncing state. Returns an unsubscribe.
export const onQueueChange = (listener) => {
  listeners.add(listener);
  notify();
  return () => listeners.delete(listener);
};

// A short, human-readable ref for the printed receipt. The customer needs
// something to hand back over the counter, and the real sequential POS- number
// does not exist until this sale reaches the server.
const offlineRefFrom = (clientRef) =>
  `OFF-${String(clientRef).replace(/-/g, "").slice(0, 6).toUpperCase()}`;

// Park a sale locally. Returns the receipt-shaped object the POS prints from, so
// an offline sale looks and prints exactly like an online one.
// `reuse` carries the refs a sale was ALREADY given before it was sent to the
// server. It matters when the till gave up waiting on a slow line: that request
// may still land, so the queued copy has to be the same sale — same clientRef,
// so the server recognises it and hands back the receipt instead of ringing it
// up twice, and same printed ref, so the slip in the customer's hand still
// finds it.
export const queueSale = async (payload, reuse = {}) => {
  const clientRef = reuse.clientRef || newClientRef();
  const offlineRef = reuse.offlineRef || offlineRefFrom(clientRef);
  const soldAt = reuse.soldAt || new Date().toISOString();

  await queueAdd({ ...payload, clientRef, offlineRef, soldAt });
  await notify();

  return { clientRef, offlineRef, soldAt };
};

export const pendingCount = () => queueCount().catch(() => 0);

/* Refs for a sale that is about to be SENT, not queued.
 *
 * Every sale gets these up front now. The clientRef goes to the server, which
 * stores it and refuses to ring the same one up twice — which is the whole
 * reason the till is allowed to stop waiting for a slow reply and queue the
 * sale instead. Without it, giving up on a request would risk charging the
 * customer for it twice.
 */
export const newSaleRefs = () => {
  const clientRef = newClientRef();
  return {
    clientRef,
    offlineRef: offlineRefFrom(clientRef),
    soldAt: new Date().toISOString(),
  };
};

/* How long the till waits for the server before it stops waiting.
 *
 * This is not a network setting, it is a decision about a queue of customers:
 * past about a second and a half the cashier is standing there doing nothing,
 * and the sale is better taken locally and settled with the server afterwards.
 * A healthy connection answers in well under this and never sees it.
 *
 * Per-till override, for a shop on a genuinely slow line that would rather wait
 * and keep real receipt numbers:
 *   localStorage.setItem("pos-checkout-timeout", "4000")
 */
export const checkoutTimeoutMs = () => {
  try {
    const saved = Number(localStorage.getItem("pos-checkout-timeout"));
    if (Number.isFinite(saved) && saved >= 500 && saved <= 60000) return saved;
  } catch {
    /* private mode — fall through to the default */
  }
  return 1500;
};

// Push everything we have. Safe to call at any time — it no-ops when offline,
// when the queue is empty, or when a sync is already running.
export const syncQueue = async () => {
  if (syncing) return { skipped: true };
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { skipped: true };
  }

  const sales = await queueAll().catch(() => []);
  if (sales.length === 0) return { synced: 0 };

  syncing = true;
  await notify();

  try {
    const response = await axiosInstance.post("pos/sync", { sales });
    const results = response.data?.results || [];

    // Only clear refs the server actually confirmed. A ref it rejected stays
    // queued so the shop can see it and it can be retried.
    let synced = 0;
    const failed = [];

    for (const result of results) {
      if (result.ok) {
        await queueRemove(result.clientRef);
        synced += 1;
      } else {
        failed.push(result);
      }
    }

    return { synced, failed };
  } catch (error) {
    // Network died again, or the server errored. Everything stays queued —
    // that is the whole point.
    return { synced: 0, error: error.response?.data?.message || error.message };
  } finally {
    syncing = false;
    await notify();
  }
};

// Was this failure "the network is gone" rather than "the server said no"?
// A 4xx is a real rejection and must surface to the cashier; a dead connection
// is what the queue exists for.
export const isNetworkError = (error) =>
  !error.response ||
  error.code === "ERR_NETWORK" ||
  // A timeout. Axios reports its own deadline as ECONNABORTED and a socket
  // one as ETIMEDOUT; both mean the same thing to a cashier — no answer came
  // back — and both belong in the queue rather than on the screen.
  error.code === "ECONNABORTED" ||
  error.code === "ETIMEDOUT";

let started = false;

// Retry whenever the browser says we are back, and on a slow heartbeat for the
// case where the browser thinks it is online but the shop's line is actually
// down (`navigator.onLine` only knows about the local link).
export const startAutoSync = () => {
  if (started || typeof window === "undefined") return () => {};
  started = true;

  const attempt = () => { syncQueue(); };

  window.addEventListener("online", attempt);
  const timer = setInterval(attempt, 60000);
  attempt();

  return () => {
    window.removeEventListener("online", attempt);
    clearInterval(timer);
    started = false;
  };
};
