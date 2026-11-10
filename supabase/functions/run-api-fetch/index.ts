import { corsHeaders } from "../_shared/cors.ts";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApiName = "weather" | "currency" | "timezone" | "dictionary" | "country" | "trivia";

interface ApiResult {
  result: string;          // formatted string for display in card/text component
  raw?: Record<string, unknown>; // structured data for future typed renderers
}

// ─── API Adapters — each calls a free, no-auth-required API ──────────────────

async function weatherAdapter(params: Record<string, unknown>): Promise<ApiResult> {
  const city = String(params.city ?? "London");

  // Step 1: Geocode city → lat/lng via Open-Meteo geocoding
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
  );
  const geoData = await geoRes.json();

  if (!geoData.results?.length) {
    throw new Error(`City not found: "${city}". Try a different spelling.`);
  }

  const { latitude, longitude, name, country } = geoData.results[0];

  // Step 2: Get current weather from Open-Meteo (free, no key needed)
  const weatherRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m` +
    `&temperature_unit=celsius&wind_speed_unit=kmh&timezone=auto`
  );
  const weatherData = await weatherRes.json();
  const c = weatherData.current;

  // WMO weather code → emoji + description
  const condition = wmoToCondition(c.weather_code);

  const result = [
    `${condition.emoji} ${condition.label}`,
    `🌡️ ${Math.round(c.temperature_2m)}°C (feels like ${Math.round(c.apparent_temperature)}°C)`,
    `💨 Wind: ${Math.round(c.wind_speed_10m)} km/h`,
    `💧 Humidity: ${c.relative_humidity_2m}%`,
    `📍 ${name}, ${country}`,
  ].join("\n");

  return {
    result,
    raw: { temp_c: c.temperature_2m, feels_like_c: c.apparent_temperature, condition: condition.label, city: name, country },
  };
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

async function currencyAdapter(params: Record<string, unknown>): Promise<ApiResult> {
  const from = String(params.from ?? "USD").toUpperCase();
  const to = String(params.to ?? "EUR").toUpperCase();
  const amount = Number(params.amount ?? 1);

  const res = await fetch(`https://open.er-api.com/v6/latest/${from}`);
  const data = await res.json();

  if (data.result === "error") throw new Error(`Currency "${from}" not found.`);

  const rate = data.rates[to];
  if (!rate) throw new Error(`Target currency "${to}" not found.`);

  const converted = (amount * rate).toFixed(2);
  const result = [
    `💱 Currency Conversion`,
    `${amount} ${from} = ${converted} ${to}`,
    `Rate: 1 ${from} = ${rate.toFixed(4)} ${to}`,
    `Updated: ${data.time_last_update_utc?.split(" 00:")[0] ?? "recently"}`,
  ].join("\n");

  return { result, raw: { from, to, rate, converted: parseFloat(converted), amount } };
}

async function timezoneAdapter(params: Record<string, unknown>): Promise<ApiResult> {
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

  const result = [
    `🕐 Current time in ${cityLabel}`,
    timeStr,
    dateStr,
  ].join("\n");

  return { result, raw: { timezone, time: timeStr, date: dateStr } };
}

async function dictionaryAdapter(params: Record<string, unknown>): Promise<ApiResult> {
  const word = String(params.word ?? "serendipity").toLowerCase().trim();
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);

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
  ].filter(Boolean).join("\n");

  return { result: lines, raw: { word: entry.word, phonetic: entry.phonetic, definition: def?.definition } };
}

async function countryAdapter(params: Record<string, unknown>): Promise<ApiResult> {
  const name = String(params.name ?? "Japan");
  const res = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(name)}?fullText=false&fields=name,capital,population,currencies,flags,region,languages`);

  if (!res.ok) throw new Error(`Country "${name}" not found.`);

  const data = await res.json();
  const c = data[0];
  const currencies = Object.values(c.currencies ?? {}).map((cur: unknown) => {
    const currency = cur as { name: string; symbol: string };
    return `${currency.name} (${currency.symbol})`;
  }).join(", ");
  const languages = Object.values(c.languages ?? {}).join(", ");

  const result = [
    `${c.flags?.emoji ?? "🏳️"} ${c.name?.common}`,
    `🌍 Region: ${c.region}`,
    `🏙️ Capital: ${c.capital?.[0] ?? "N/A"}`,
    `👥 Population: ${Number(c.population).toLocaleString()}`,
    `💰 Currency: ${currencies}`,
    `🗣️ Languages: ${languages}`,
  ].join("\n");

  return { result, raw: { name: c.name?.common, capital: c.capital?.[0], population: c.population } };
}

async function triviaAdapter(params: Record<string, unknown>): Promise<ApiResult> {
  const num = params.number !== undefined ? Number(params.number) : Math.floor(Math.random() * 1000);
  const type = String(params.type ?? "trivia");

  const res = await fetch(`http://numbersapi.com/${num}/${type}`);
  const text = await res.text();

  return { result: `💡 ${text}`, raw: { number: num, type, fact: text } };
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

const ADAPTERS: Record<ApiName, (params: Record<string, unknown>) => Promise<ApiResult>> = {
  weather: weatherAdapter,
  currency: currencyAdapter,
  timezone: timezoneAdapter,
  dictionary: dictionaryAdapter,
  country: countryAdapter,
  trivia: triviaAdapter,
};

// ─── Edge Function handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { api, params = {} } = body as { api: string; params: Record<string, unknown> };

    if (!api) {
      return new Response(JSON.stringify({ error: "api field is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adapter = ADAPTERS[api as ApiName];
    if (!adapter) {
      return new Response(
        JSON.stringify({ error: `Unknown API "${api}". Allowed: ${Object.keys(ADAPTERS).join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await adapter(params);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = (e as Error).message ?? "Internal error";
    console.error("run-api-fetch error:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
