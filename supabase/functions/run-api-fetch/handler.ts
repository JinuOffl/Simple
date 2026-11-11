import { corsHeaders } from "../_shared/cors.ts";
import { consumeCreditsRpc } from "../_shared/credits.ts";
import { UUID_REGEX } from "../_shared/mcpDb.ts";
import { sanitizeToolOutputText } from "../_shared/mcpSecurity.ts";

export type ApiName =
  | "weather"
  | "currency"
  | "timezone"
  | "dictionary"
  | "country"
  | "trivia";

export interface ApiResult {
  result: string;
  raw?: Record<string, unknown>;
}

export interface RunApiFetchDeps {
  getEnv?: (key: string) => string | undefined;
  verifyJwt?: (authHeader: string) => Promise<{ userId: string } | null>;
  chargeCredits?: (args: { userId: string; api: ApiName; appId?: string }) => Promise<{
    allowed: boolean;
    remainingCredits?: number;
    monthlyCreditLimit?: number;
  }>;
  baseFetch?: typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchWithTimeout(
  url: string,
  fetchFn: typeof fetch,
  timeoutMs = 10_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("Upstream API timeout"), timeoutMs);
  try {
    return await fetchFn(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function wmoToCondition(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: "☀️", label: "Clear sky" };
  if (code <= 2) return { emoji: "🌤️", label: "Partly cloudy" };
  if (code === 3) return { emoji: "☁️", label: "Overcast" };
  if (code <= 49) return { emoji: "🌫️", label: "Foggy" };
  if (code <= 59) return { emoji: "🌦️", label: "Drizzle" };
  if (code <= 69) return { emoji: "🌧️", label: "Rain" };
  if (code <= 79) return { emoji: "🌨️", label: "Snow" };
  if (code <= 84) return { emoji: "🌧️", label: "Rain showers" };
  if (code <= 94) return { emoji: "⛈️", label: "Thunderstorm" };
  return { emoji: "⛈️", label: "Severe thunderstorm" };
}

async function weatherAdapter(
  params: Record<string, unknown>,
  fetchFn: typeof fetch
): Promise<ApiResult> {
  const city = String(params.city ?? "London");
  const geoRes = await fetchWithTimeout(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
    fetchFn
  );
  const geoData = await geoRes.json();
  if (!geoData.results?.length) {
    throw new Error(`City not found: "${city}". Try a different spelling.`);
  }

  const { latitude, longitude, name, country } = geoData.results[0];
  const weatherRes = await fetchWithTimeout(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
      `&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto`,
    fetchFn
  );
  const weatherData = await weatherRes.json();
  const c = weatherData.current;
  const condition = wmoToCondition(c.weather_code);

  const result = sanitizeToolOutputText(
    [
      `${condition.emoji} ${condition.label}`,
      `🌡️ ${Math.round(c.temperature_2m)}°C (feels like ${Math.round(c.apparent_temperature)}°C)`,
      `💨 Wind: ${Math.round(c.wind_speed_10m)} km/h`,
      `💧 Humidity: ${c.relative_humidity_2m}%`,
      `📍 ${name}, ${country}`,
    ].join("\n")
  );

  return {
    result,
    raw: {
      temp_c: c.temperature_2m,
      feels_like_c: c.apparent_temperature,
      condition: condition.label,
      city: name,
      country,
    },
  };
}

async function currencyAdapter(
  params: Record<string, unknown>,
  fetchFn: typeof fetch
): Promise<ApiResult> {
  const from = String(params.from ?? "USD").toUpperCase();
  const to = String(params.to ?? "EUR").toUpperCase();
  const amount = Number(params.amount ?? 1);

  const res = await fetchWithTimeout(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`, fetchFn);
  const data = await res.json();
  if (data.result === "error") throw new Error(`Currency "${from}" not found.`);

  const rate = data.rates?.[to];
  if (!rate) throw new Error(`Target currency "${to}" not found.`);

  const converted = (amount * rate).toFixed(2);
  const result = sanitizeToolOutputText(
    [
      `💱 Currency Conversion`,
      `${amount} ${from} = ${converted} ${to}`,
      `Rate: 1 ${from} = ${Number(rate).toFixed(4)} ${to}`,
      `Updated: ${data.time_last_update_utc?.split(" 00:")[0] ?? "recently"}`,
    ].join("\n")
  );

  return { result, raw: { from, to, rate, converted: parseFloat(converted), amount } };
}

function timezoneAdapter(params: Record<string, unknown>): Promise<ApiResult> {
  const timezone = String(params.timezone ?? "America/New_York");
  const now = new Date();
  const timeStr = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(now);
  const dateStr = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);
  const cityLabel = timezone.replace(/_/g, " ").split("/").pop() ?? timezone;

  return Promise.resolve({
    result: sanitizeToolOutputText([`🕐 Current time in ${cityLabel}`, timeStr, dateStr].join("\n")),
    raw: { timezone, time: timeStr, date: dateStr },
  });
}

async function dictionaryAdapter(
  params: Record<string, unknown>,
  fetchFn: typeof fetch
): Promise<ApiResult> {
  const word = String(params.word ?? "serendipity").toLowerCase().trim();
  const res = await fetchWithTimeout(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    fetchFn
  );
  if (!res.ok) throw new Error(`Word "${word}" not found in dictionary.`);

  const data = await res.json();
  const entry = data[0];
  const meaning = entry.meanings?.[0];
  const def = meaning?.definitions?.[0];

  const lines = [
    `📖 ${entry.word}`,
    entry.phonetic ? `Pronunciation: ${entry.phonetic}` : null,
    meaning ? `(${meaning.partOfSpeech})` : null,
    def?.definition ? `Definition: ${def.definition}` : null,
    def?.example ? `Example: "${def.example}"` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    result: sanitizeToolOutputText(lines),
    raw: { word: entry.word, phonetic: entry.phonetic, definition: def?.definition },
  };
}

async function countryAdapter(
  params: Record<string, unknown>,
  fetchFn: typeof fetch
): Promise<ApiResult> {
  const name = String(params.name ?? "Japan");
  const res = await fetchWithTimeout(
    `https://restcountries.com/v3.1/name/${encodeURIComponent(name)}?fullText=false&fields=name,capital,population,currencies,flags,region,languages`,
    fetchFn
  );
  if (!res.ok) throw new Error(`Country "${name}" not found.`);

  const data = await res.json();
  const c = data[0];
  const currencies = Object.values(c.currencies ?? {})
    .map((cur: unknown) => {
      const currency = cur as { name: string; symbol: string };
      return `${currency.name} (${currency.symbol})`;
    })
    .join(", ");
  const languages = Object.values(c.languages ?? {}).join(", ");

  const result = sanitizeToolOutputText(
    [
      `${c.flags?.emoji ?? "🏳️"} ${c.name?.common}`,
      `🌍 Region: ${c.region}`,
      `🏙️ Capital: ${c.capital?.[0] ?? "N/A"}`,
      `👥 Population: ${Number(c.population).toLocaleString()}`,
      `💰 Currency: ${currencies}`,
      `🗣️ Languages: ${languages}`,
    ].join("\n")
  );

  return {
    result,
    raw: { name: c.name?.common, capital: c.capital?.[0], population: c.population },
  };
}

async function triviaAdapter(
  params: Record<string, unknown>,
  fetchFn: typeof fetch
): Promise<ApiResult> {
  const num =
    params.number !== undefined ? Math.floor(Number(params.number)) : Math.floor(Math.random() * 1000);
  const safeNum = Number.isFinite(num) ? num : 42;
  const rawType = String(params.type ?? "trivia");
  const type = ["trivia", "math", "date", "year"].includes(rawType) ? rawType : "trivia";
  const res = await fetchWithTimeout(`http://numbersapi.com/${safeNum}/${type}`, fetchFn);
  const text = await res.text();
  return { result: sanitizeToolOutputText(`💡 ${text}`), raw: { number: safeNum, type, fact: text } };
}

const ADAPTERS: Record<
  ApiName,
  (params: Record<string, unknown>, fetchFn: typeof fetch) => Promise<ApiResult>
> = {
  weather: weatherAdapter,
  currency: currencyAdapter,
  timezone: (params) => timezoneAdapter(params),
  dictionary: dictionaryAdapter,
  country: countryAdapter,
  trivia: triviaAdapter,
};

async function resolveCallerUserId(
  authHeader: string,
  getEnv: (k: string) => string | undefined,
  baseFetch: typeof fetch
): Promise<{ userId: string } | null> {
  const localDevOpen = getEnv("API_FETCH_LOCAL_DEV_OPEN") === "true" || getEnv("MCP_ALLOW_LOCAL_DEV_LOOPBACK") === "true";
  const supabaseUrl = getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY") ?? getEnv("VITE_SUPABASE_ANON_KEY");

  if (localDevOpen && (!authHeader || authHeader.includes("local-dev-preview"))) {
    return { userId: "local-dev-user" };
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return localDevOpen ? { userId: "local-dev-user" } : null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;

  try {
    const res = await baseFetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    const data = (await res.json()) as { id?: string };
    return data.id ? { userId: data.id } : null;
  } catch {
    return null;
  }
}

export async function handleRunApiFetch(
  req: Request,
  deps: RunApiFetchDeps = {}
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const getEnv = deps.getEnv ?? ((k: string) => Deno.env.get(k));
  const baseFetch = deps.baseFetch ?? fetch;
  const authHeader = req.headers.get("authorization") ?? "";

  const user = deps.verifyJwt
    ? await deps.verifyJwt(authHeader)
    : await resolveCallerUserId(authHeader, getEnv, baseFetch);

  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const body = (await req.json()) as {
      api?: string;
      params?: Record<string, unknown>;
      app_id?: string;
    };
    const { api, params = {}, app_id: appId } = body;

    if (!api) {
      return jsonResponse({ error: "api field is required" }, 400);
    }

    const adapter = ADAPTERS[api as ApiName];
    if (!adapter) {
      return jsonResponse(
        { error: `Unknown API "${api}". Allowed: ${Object.keys(ADAPTERS).join(", ")}` },
        400
      );
    }

    const supabaseUrl = getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (deps.chargeCredits) {
      const creditOutcome = await deps.chargeCredits({
        userId: user.userId,
        api: api as ApiName,
        appId,
      });
      if (!creditOutcome.allowed) {
        return jsonResponse(
          {
            error: "Insufficient monthly credits for API fetch.",
            remaining_credits: creditOutcome.remainingCredits,
            monthly_credit_limit: creditOutcome.monthlyCreditLimit,
          },
          402
        );
      }
    } else if (supabaseUrl && serviceRoleKey && user.userId !== "local-dev-user") {
      const creditOutcome = await consumeCreditsRpc({
        supabaseUrl,
        serviceRoleKey,
        userId: user.userId,
        actionKind: "api_fetch",
        costClass: "api_fetch",
        appId: appId && UUID_REGEX.test(appId) ? appId : undefined,
        metadata: { api },
        fetchFn: baseFetch,
      });
      if (!creditOutcome.allowed) {
        return jsonResponse(
          {
            error: "Insufficient monthly credits for API fetch.",
            remaining_credits: creditOutcome.remainingCredits,
            monthly_credit_limit: creditOutcome.monthlyCreditLimit,
          },
          402
        );
      }
    }

    const result = await adapter(params, baseFetch);
    return jsonResponse(result, 200);
  } catch (e) {
    const msg = (e as Error).message ?? "Internal error";
    return jsonResponse({ error: msg }, 500);
  }
}
