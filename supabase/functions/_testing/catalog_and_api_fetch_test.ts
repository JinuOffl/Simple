import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";

import {
  CATALOG_ADAPTERS,
  getCatalogAdapter,
  buildCatalogUrl,
  pickJsonPath,
} from "../_shared/catalog.ts";
import { handleRunApiFetch } from "../run-api-fetch/handler.ts";

Deno.test("catalog: buildCatalogUrl handles parameters, encoding, keys, and enforces HTTPS", () => {
  const adapter = getCatalogAdapter("openweather");
  assert(adapter !== undefined, "openweather adapter must exist");

  // 1. Success with query params and query key injection
  const url = buildCatalogUrl(
    adapter,
    { q: "San Francisco, US", units: "metric" },
    { keyIn: "query", keyName: "appid", keyValue: "secret_ow_key_999" }
  );

  const parsed = new URL(url);
  assertEquals(parsed.protocol, "https:");
  assertEquals(parsed.hostname, "api.openweathermap.org");
  assertEquals(parsed.pathname, "/data/2.5/weather");
  assertEquals(parsed.searchParams.get("q"), "San Francisco, US");
  assertEquals(parsed.searchParams.get("units"), "metric");
  assertEquals(parsed.searchParams.get("appid"), "secret_ow_key_999");

  // 2. Reject HTTP (non-HTTPS) template
  assertThrows(
    () => {
      buildCatalogUrl({
        id: "insecure",
        title: "Insecure",
        kind: "http_json",
        method: "GET",
        urlTemplate: "http://insecure.example.com/api",
        params: [],
        resultPath: [],
        displayTemplate: "{{result}}",
      });
    },
    Error,
    "Catalog adapters require HTTPS"
  );

  // 3. Throws on missing required query parameter
  assertThrows(
    () => {
      buildCatalogUrl(adapter, {});
    },
    Error,
    'Missing required query parameter: "q"'
  );
});

Deno.test("catalog: pickJsonPath correctly extracts nested objects and array elements", () => {
  const data = {
    slip: { id: 42, advice: "Always carry a towel." },
    weather: [
      { id: 800, main: "Clear", description: "clear sky", icon: "01d" },
    ],
    nested: { deep: { list: [10, 20, 30] } },
  };

  assertEquals(pickJsonPath(data, ["slip", "advice"]), "Always carry a towel.");
  assertEquals(pickJsonPath(data, ["weather", "0", "description"]), "clear sky");
  assertEquals(pickJsonPath(data, ["nested", "deep", "list", "1"]), 20);
  assertEquals(pickJsonPath(data, ["weather", "5", "description"]), undefined);
  assertEquals(pickJsonPath(data, ["nonexistent", "path"]), undefined);
});

Deno.test("catalog: all declared catalog adapters satisfy security and formatting contracts", () => {
  for (const adapter of CATALOG_ADAPTERS) {
    assert(adapter.urlTemplate.startsWith("https://"), `${adapter.id} must use HTTPS`);
    assert(adapter.displayTemplate.includes("{{result}}"), `${adapter.id} must format {{result}}`);
    assert(adapter.resultPath.length > 0, `${adapter.id} must define a non-empty resultPath`);

    if (adapter.keyId) {
      assert(adapter.keyIn === "query" || adapter.keyIn === "header", `${adapter.id} keyIn must be query or header`);
      assert(typeof adapter.keyName === "string" && adapter.keyName.length > 0, `${adapter.id} must define keyName`);
      assert(typeof adapter.helpUrl === "string" && adapter.helpUrl.startsWith("https://"), `${adapter.id} must provide https helpUrl`);
    }
  }
});

Deno.test("run-api-fetch catalog runner: returns HTTP 424 missing_key when keyed adapter has no saved key", async () => {
  const req = new Request("https://edge.local/run-api-fetch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-jwt",
    },
    body: JSON.stringify({
      api: "openweather",
      params: { q: "London" },
    }),
  });

  const res = await handleRunApiFetch(req, {
    getEnv: () => undefined,
    verifyJwt: () => Promise.resolve({ userId: "user-test-1" }),
    chargeCredits: () => Promise.resolve({ allowed: true, remainingCredits: 10, monthlyCreditLimit: 100 }),
    loadConnectionSecret: (_userId, _keyId) => Promise.resolve(undefined), // no key stored
  });

  assertEquals(res.status, 424);
  const body = await res.json();
  assertEquals(body, { error: "missing_key", key_id: "openweather" });
});

Deno.test("run-api-fetch catalog runner: injects key, fetches upstream, formats display, and never leaks secret in response", async () => {
  const secretKey = "super_confidential_openweather_key_abc_123";
  let capturedUpstreamUrl = "";

  const req = new Request("https://edge.local/run-api-fetch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-jwt",
    },
    body: JSON.stringify({
      api: "openweather",
      params: { q: "Kyoto", units: "metric" },
    }),
  });

  const res = await handleRunApiFetch(req, {
    getEnv: (k) => {
      if (k === "API_FETCH_LOCAL_DEV_OPEN") return "true";
      return undefined;
    },
    verifyJwt: () => Promise.resolve({ userId: "user-test-1" }),
    chargeCredits: () => Promise.resolve({ allowed: true, remainingCredits: 9, monthlyCreditLimit: 100 }),
    loadConnectionSecret: (_userId, keyId) => {
      assertEquals(keyId, "openweather");
      return Promise.resolve(secretKey);
    },
    baseFetch: (input) => {
      capturedUpstreamUrl = typeof input === "string" ? input : input.toString();
      return Promise.resolve(
        new Response(
          JSON.stringify({
            weather: [{ description: "light rain", main: "Rain" }],
            main: { temp: 18.5 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    },
  });

  assertEquals(res.status, 200);

  // Upstream URL received the key
  assertStringIncludes(capturedUpstreamUrl, `appid=${secretKey}`);
  assertStringIncludes(capturedUpstreamUrl, "q=Kyoto");

  const responseText = await res.text();
  const body = JSON.parse(responseText);

  // Formatted display text using template "Weather: {{result}}"
  assertEquals(body.result, "Weather: light rain");
  assertEquals(body.raw.value, "light rain");

  // Critical Security Invariant: The secret key must NEVER be leaked into the client response!
  assertEquals(responseText.includes(secretKey), false, "Raw API key must never appear in response text");
  assertEquals(JSON.stringify(body).includes(secretKey), false, "Raw API key must never appear in response JSON");
});

Deno.test("run-api-fetch catalog runner: keyless adapters (advice & cat_fact) execute cleanly without requiring keys", async () => {
  // Test advice
  const reqAdvice = new Request("https://edge.local/run-api-fetch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-jwt",
    },
    body: JSON.stringify({ api: "advice", params: {} }),
  });

  const resAdvice = await handleRunApiFetch(reqAdvice, {
    getEnv: () => undefined,
    verifyJwt: () => Promise.resolve({ userId: "user-test-1" }),
    chargeCredits: () => Promise.resolve({ allowed: true, remainingCredits: 8, monthlyCreditLimit: 100 }),
    baseFetch: () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ slip: { id: 7, advice: "Remember to drink water." } }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      ),
  });

  assertEquals(resAdvice.status, 200);
  const bodyAdvice = await resAdvice.json();
  assertEquals(bodyAdvice.result, "💡 Advice: Remember to drink water.");

  // Test cat_fact
  const reqCat = new Request("https://edge.local/run-api-fetch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-jwt",
    },
    body: JSON.stringify({ api: "cat_fact", params: {} }),
  });

  const resCat = await handleRunApiFetch(reqCat, {
    getEnv: () => undefined,
    verifyJwt: () => Promise.resolve({ userId: "user-test-1" }),
    chargeCredits: () => Promise.resolve({ allowed: true, remainingCredits: 7, monthlyCreditLimit: 100 }),
    baseFetch: () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ fact: "Cats sleep 70% of their lives.", length: 29 }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      ),
  });

  assertEquals(resCat.status, 200);
  const bodyCat = await resCat.json();
  assertEquals(bodyCat.result, "🐱 Fact: Cats sleep 70% of their lives.");
});
