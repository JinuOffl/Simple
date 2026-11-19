// Service Worker for Simple Web App Shell & Assets
const CACHE_VERSION = "simple-v1";
const CACHE_NAME = `simple-cache-${CACHE_VERSION}`;

function shouldCacheRequest(request) {
  if (request.method !== "GET") return false;

  let url;
  try {
    url = new URL(request.url);
  } catch {
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

  // Stale-while-revalidate for same-origin static assets & app shell
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

      return cachedResponse || networkFetch;
    })
  );
});
