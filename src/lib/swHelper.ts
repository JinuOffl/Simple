/**
 * Pure helper for Service Worker request caching decisions.
 * Enforces security & correctness:
 * - Cache-first / stale-while-revalidate ONLY for same-origin GET requests.
 * - NEVER cache non-GET requests (POST, PUT, DELETE, etc.).
 * - NEVER intercept requests to Supabase domains or /functions/.
 */
export function shouldCache(
  request: { method?: string; url?: string },
  selfOrigin?: string
): boolean {
  if (!request || typeof request.url !== "string" || !request.url.trim()) return false;
  const method = (request.method ?? "GET").toUpperCase();
  if (method !== "GET") return false;

  let urlObj: URL;
  try {
    urlObj = new URL(request.url, selfOrigin ?? "http://localhost");
  } catch {
    return false;
  }

  // Only http/https protocols
  if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
    return false;
  }

  // Never cache Supabase domains
  const host = urlObj.hostname.toLowerCase();
  if (
    host.includes("supabase.co") ||
    host.includes("supabase.in") ||
    host.includes("supabase.net")
  ) {
    return false;
  }

  // Never cache edge functions or API function paths
  const path = urlObj.pathname.toLowerCase();
  if (path.startsWith("/functions/") || path.includes("/functions/v1/")) {
    return false;
  }

  // Cross-origin requests (e.g. LLMs, CDN, analytics) are not cached by default app shell SW
  const originToMatch = selfOrigin ?? (typeof location !== "undefined" ? location.origin : undefined);
  if (originToMatch && urlObj.origin !== originToMatch) {
    return false;
  }

  return true;
}
