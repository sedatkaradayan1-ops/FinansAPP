// Minimal service worker: caches the app shell + static assets so the PWA is
// installable and has a basic offline fallback. Deliberately simple — network
// requests to /api/* and server-rendered pages always go to the network
// first (financial data must never be served stale) with a cache fallback
// only when fully offline.
const CACHE_NAME = "fkm-shell-v1";
const SHELL_ASSETS = ["/manifest.webmanifest", "/assets/pwa-icon-192.png", "/assets/pwa-icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never intercept API calls or cross-origin requests — always fresh.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && SHELL_ASSETS.some((a) => url.pathname === a)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  );
});

