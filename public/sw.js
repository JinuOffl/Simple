// Service Worker for Simple Web App Shell & Assets
// Note: shouldCacheRequest logic must remain in 1:1 parity with src/lib/swHelper.ts
const CACHE_VERSION = "simple-v2";
const CACHE_NAME = `simple-cache-${CACHE_VERSION}`;

function shouldCacheRequest(request) {
  if (!request || request.method !== "GET") return false;

  let url;
  try {
    url = new URL(request.url, self.location.origin);
  } catch {
    return false;
  }

  // Only http/https protocols
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  // Only same-origin
  if (url.origin !== self.location.origin) return false;

  // Never cache Supabase endpoints or edge functions
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if (
    host.includes("supabase.co") ||
    host.includes("supabase.in") ||
    host.includes("supabase.net") ||
    path.startsWith("/functions/") ||
    path.includes("/functions/v1/")
  ) {
    return false;
  }

  return true;
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!shouldCacheRequest(request)) {
    return;
  }

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  const isNavigation =
    request.mode === "navigate" ||
    request.destination === "document" ||
    url.pathname === "/" ||
    url.pathname.endsWith("/index.html");

  if (isNavigation) {
    // Network-first for HTML navigations
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cached = (await cache.match(request)) || (await cache.match("/"));
          return cached || Response.error();
        })
    );
    return;
  }

  // Stale-while-revalidate for hashed static assets & images
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cachedResponse = await cache.match(request);
      const networkFetch = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      const response = cachedResponse || (await networkFetch);
      return response || Response.error();
    })
  );
});
