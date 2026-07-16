// A very small promise wrapper over IndexedDB — no dependency, ~one screen.
//
// IndexedDB rather than localStorage because the catalogue is ~2,500 products:
// that is comfortably past what localStorage is happy holding, and a queued sale
// must never be lost to a quota error mid-shift.

const DB_NAME = "e360-pos";
const DB_VERSION = 1;

// Cached catalogue (products/categories/deals) — replaced wholesale on refresh.
const CACHE_STORE = "cache";
// Sales rung up with no network, waiting to sync. Keyed by the till's clientRef.
const QUEUE_STORE = "queue";

let dbPromise = null;

const openDb = () => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE);
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "clientRef" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
};

const run = async (storeName, mode, work) => {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;

    // Resolve on `complete`, not on the request's success: a write is only
    // really durable once the transaction commits.
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);

    const request = work(store);
    if (request) request.onsuccess = () => { result = request.result; };
  });
};

// --- Catalogue cache -------------------------------------------------------

export const cacheSet = (key, value) =>
  run(CACHE_STORE, "readwrite", (store) =>
    store.put({ value, cachedAt: Date.now() }, key)
  );

export const cacheGet = async (key) => {
  const row = await run(CACHE_STORE, "readonly", (store) => store.get(key));
  return row ? row.value : null;
};

export const cacheAge = async (key) => {
  const row = await run(CACHE_STORE, "readonly", (store) => store.get(key));
  return row ? Date.now() - row.cachedAt : null;
};

// --- Offline sale queue ----------------------------------------------------

export const queueAdd = (sale) =>
  run(QUEUE_STORE, "readwrite", (store) => store.put(sale));

export const queueAll = () =>
  run(QUEUE_STORE, "readonly", (store) => store.getAll());

export const queueRemove = (clientRef) =>
  run(QUEUE_STORE, "readwrite", (store) => store.delete(clientRef));

export const queueCount = () =>
  run(QUEUE_STORE, "readonly", (store) => store.count());

// A stable, collision-free id for each offline sale. This is the idempotency
// key the server dedupes on, so it must never repeat.
export const newClientRef = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

// --- Vouchers spent while offline ------------------------------------------
//
// A voucher is single-use, but offline the till cannot ask the server whether a
// code is still good. It can at least stop the same code being spent twice on
// THIS till — which is the likely mistake. Two different tills spending the same
// code during an outage is still possible; the server flags that at sync.

const SPENT_KEY = "vouchers-spent-offline";

export const markVoucherSpent = async (code) => {
  const spent = (await cacheGet(SPENT_KEY)) || [];
  const upper = String(code).toUpperCase();
  if (!spent.includes(upper)) await cacheSet(SPENT_KEY, [...spent, upper]);
};

export const isVoucherSpentOffline = async (code) => {
  const spent = (await cacheGet(SPENT_KEY)) || [];
  return spent.includes(String(code).toUpperCase());
};

// Cleared once the queue has drained — the server is the authority again.
export const clearSpentVouchers = () => cacheSet(SPENT_KEY, []);

// --- Suspended sales held on this till -------------------------------------
//
// Normally a held sale lives on the server so any till can resume it. With no
// line that is impossible, so it is parked here instead: the same till can still
// suspend a basket and pick it back up. These are baskets, not money — nothing
// is owed until they are charged — so they are never synced, just resumed.

const HELD_KEY = "held-local";

export const localHeldAll = async () => (await cacheGet(HELD_KEY)) || [];

export const localHeldAdd = async (held) => {
  const all = await localHeldAll();
  await cacheSet(HELD_KEY, [{ ...held, _id: held._id || newClientRef(), local: true }, ...all]);
};

export const localHeldRemove = async (id) => {
  const all = await localHeldAll();
  await cacheSet(
    HELD_KEY,
    all.filter((entry) => entry._id !== id)
  );
};
