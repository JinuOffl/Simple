/**
 * Declarative Catalog of External HTTP/JSON API Adapters (ADR-007 / Phase 7).
 *
 * Each adapter is pure DATA, not executable code:
 * - urlTemplate (https only)
 * - params specification (query or path)
 * - optional key requirements loaded securely server-side from connection_secrets
 * - resultPath to pick display text
 * - displayTemplate for formatted presentation
 */

export interface CatalogParam {
  name: string;
  in: "query" | "path";
  required?: boolean;
}

export interface CatalogAdapter {
  id: string;
  title: string;
  kind: "http_json";
  method: "GET";
  urlTemplate: string;
  params: CatalogParam[];
  keyId?: string;
  keyIn?: "query" | "header";
  keyName?: string;
  resultPath: string[];
  displayTemplate: string;
  helpUrl?: string;
}

export const CATALOG_ADAPTERS: readonly CatalogAdapter[] = [
  // ── Keyless Adapters ──────────────────────────────────────────────────────────
  {
    id: "advice",
    title: "Advice Slip",
    kind: "http_json",
    method: "GET",
    urlTemplate: "https://api.adviceslip.com/advice",
    params: [],
    resultPath: ["slip", "advice"],
    displayTemplate: "💡 Advice: {{result}}",
  },
  {
    id: "cat_fact",
    title: "Cat Fact",
    kind: "http_json",
    method: "GET",
    urlTemplate: "https://catfact.ninja/fact",
    params: [],
    resultPath: ["fact"],
    displayTemplate: "🐱 Fact: {{result}}",
  },

  // ── Keyed Adapters (verified docs & free tiers cited in comments) ───────────
  // Doc URL: https://openweathermap.org/current
  // Key sign-up: https://home.openweathermap.org/users/sign_up
  {
    id: "openweather",
    title: "OpenWeather Current",
    kind: "http_json",
    method: "GET",
    urlTemplate: "https://api.openweathermap.org/data/2.5/weather",
    params: [
      { name: "q", in: "query", required: true },
      { name: "units", in: "query", required: false },
    ],
    keyId: "openweather",
    keyIn: "query",
    keyName: "appid",
    resultPath: ["weather", "0", "description"],
    displayTemplate: "Weather: {{result}}",
    helpUrl: "https://home.openweathermap.org/users/sign_up",
  },

  // Doc URL: https://api.nasa.gov/
  // Key sign-up: https://api.nasa.gov/
  {
    id: "nasa_api",
    title: "NASA Astronomy Picture",
    kind: "http_json",
    method: "GET",
    urlTemplate: "https://api.nasa.gov/planetary/apod",
    params: [
      { name: "date", in: "query", required: false },
    ],
    keyId: "nasa_api",
    keyIn: "query",
    keyName: "api_key",
    resultPath: ["explanation"],
    displayTemplate: "🌌 NASA: {{result}}",
    helpUrl: "https://api.nasa.gov/",
  },
];

export const CATALOG_BY_ID = new Map<string, CatalogAdapter>(
  CATALOG_ADAPTERS.map((a) => [a.id, a] as const)
);

export function getCatalogAdapter(id: string): CatalogAdapter | undefined {
  return CATALOG_BY_ID.get(id);
}

/**
 * Builds the outbound URL by injecting path parameters and query parameters.
 * Validates that template protocol is https:.
 */
export function buildCatalogUrl(
  adapter: CatalogAdapter,
  paramsValues: Record<string, unknown> = {},
  keyConfig?: { keyIn?: "query" | "header"; keyName?: string; keyValue?: string }
): string {
  let urlStr = adapter.urlTemplate;

  // Validate https only
  if (!urlStr.startsWith("https://")) {
    throw new Error(`Insecure or invalid URL template "${urlStr}". Catalog adapters require HTTPS.`);
  }

  // 1. Path parameters (:name or {name})
  for (const p of adapter.params.filter((p) => p.in === "path")) {
    const val = paramsValues[p.name];
    if (val !== undefined && val !== null) {
      urlStr = urlStr
        .replace(new RegExp(`:${p.name}\\b`, "g"), encodeURIComponent(String(val)))
        .replace(new RegExp(`\\{${p.name}\\}`, "g"), encodeURIComponent(String(val)));
    } else if (p.required) {
      throw new Error(`Missing required path parameter: "${p.name}".`);
    }
  }

  const url = new URL(urlStr);

  // 2. Query parameters
  for (const p of adapter.params.filter((p) => p.in === "query")) {
    const val = paramsValues[p.name];
    if (val !== undefined && val !== null && val !== "") {
      url.searchParams.set(p.name, String(val));
    } else if (p.required) {
      throw new Error(`Missing required query parameter: "${p.name}".`);
    }
  }

  // 3. API key query injection
  if (keyConfig?.keyIn === "query" && keyConfig.keyName && keyConfig.keyValue) {
    url.searchParams.set(keyConfig.keyName, keyConfig.keyValue);
  }

  return url.toString();
}

/**
 * Picks a nested value from a JSON object along a path array.
 */
export function pickJsonPath(data: unknown, path: string[]): unknown {
  let cur: unknown = data;
  for (const seg of path) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      cur = Number.isInteger(idx) && idx >= 0 ? cur[idx] : undefined;
    } else if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}
