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
export const queueSale = async (payload) => {
  const clientRef = newClientRef();
  const offlineRef = offlineRefFrom(clientRef);
  const soldAt = new Date().toISOString();

  await queueAdd({ ...payload, clientRef, offlineRef, soldAt });
  await notify();

  return { clientRef, offlineRef, soldAt };
};

export const pendingCount = () => queueCount().catch(() => 0);

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
  error.code === "ECONNABORTED";

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
