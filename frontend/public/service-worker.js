/* eslint-disable no-restricted-globals */

// Keeps the till usable when the shop's broadband drops.
//
// This is hand-written rather than generated, because CRA 5 does not build a
// service worker unless the app is ejected. It uses runtime caching instead of
// a precache manifest: the first online load fills the cache, and every load
// after that survives a dead connection.
//
// The one hard rule: /api/ is NEVER cached. A till showing yesterday's stock
// because a stale response was replayed would be worse than showing nothing.
// Offline API behaviour is the app's job (it queues sales in IndexedDB), not
// this file's.

// Bumped to v2: the activate handler drops every cache that isn't this version,
// so any till that already cached a 404 as its shell (see the navigate handler)
// gets a clean slate on the next load instead of carrying it forever.
const VERSION = "e360-v2";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

self.addEventListener("install", (event) => {
  // The till should pick up a new build on the next load, not three loads later.
  self.skipWaiting();

  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(["/", "/index.html", "/manifest.json"]))
      .catch(() => {
        // A failed pre-cache must not block activation — runtime caching will
        // fill it in on the first successful load.
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Let the page tell a waiting worker to take over immediately.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

const isApi = (url) => url.pathname.startsWith("/api/");

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never serve an API response from cache — see the note at the top.
  if (isApi(url) || url.origin !== self.location.origin) return;

  // Navigations: try the network so a new build is picked up, fall back to the
  // cached shell so /pos still opens with no connection.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // ONLY a successful shell may become the offline fallback. The server
          // answers unknown paths with 404 + the index.html body (so crawlers
          // get a real 404 while humans still see the app). Caching that
          // response as /index.html would poison the shell: one mistyped URL
          // and the next offline navigation serves a 404 to the till.
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put("/index.html", copy));
          }
          return response;
        })
        .catch(() =>
          caches.match("/index.html").then((cached) => cached || caches.match("/"))
        )
    );
    return;
  }

  // Build assets are content-hashed, so a cache hit is always correct. Serve it
  // instantly and refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(ASSETS).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
