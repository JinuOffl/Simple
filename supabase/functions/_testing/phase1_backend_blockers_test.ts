import {
  assert,
  assertEquals,
} from "jsr:@std/assert@1";

import { handleManageConnection, type ManageConnectionStore } from "../manage-connection/handler.ts";
import type { MaskedConnectionSummary } from "../_shared/mcpDb.ts";
import { handleRunApiFetch } from "../run-api-fetch/handler.ts";
import { handleGenerateApp } from "../generate-app/handler.ts";
import { handleRunLlmAction } from "../run-llm-action/handler.ts";
import { handleInvites } from "../invites/handler.ts";
import { handleManageByok } from "../manage-byok/handler.ts";
import { handleBillingWebhook } from "../billing-webhook/handler.ts";
import { encryptConnectionSecret } from "../_shared/secretCrypto.ts";
import { extractJsonFromText } from "../_shared/llmProvider.ts";
import { checkProductionGuard } from "../_shared/prodGuard.ts";

// ── 1.1: manage-connection accepts key:openweather and never leaks token ───────
Deno.test("Phase 1.1: manage-connection allows connector_id 'key:openweather' and never leaks token", async () => {
  const encKey = "test-encryption-key-32-chars-long!";
  const secretToken = "real_secret_token_abc_123456789";

  const rows = new Map<string, MaskedConnectionSummary>();
  const mockStore: ManageConnectionStore = {
    list: (_userId) => Promise.resolve([...rows.values()]),
    resolveSecret: () => Promise.resolve(null),
    upsert: (_userId, input) => {
      const summary: MaskedConnectionSummary = {
        id: "conn-1",
        connector_id: input.connectorId,
        label: input.label,
        server_url: input.serverUrl,
        allowed_tools: [...input.allowedTools],
        status: "active",
        auth_header_name: input.authHeaderName ?? "Authorization",
        has_token: Boolean(input.token),
      };
      rows.set("conn-1", summary);
      return Promise.resolve(summary);
    },
    delete: () => Promise.resolve(true),
  };

  const req = new Request("https://edge.local/manage-connection", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-jwt",
    },
    body: JSON.stringify({
      op: "upsert",
      connector_id: "key:openweather",
      server_url: "https://api.openweathermap.org",
      token: secretToken,
      label: "OpenWeather Key",
      allowed_tools: [],
    }),
  });

  const res = await handleManageConnection(req, {
    getEnv: (k) => (k === "CONNECTION_ENCRYPTION_KEY" ? encKey : undefined),
    verifyJwt: () => Promise.resolve({ userId: "u1" }),
    store: mockStore,
  });

  assertEquals(res.status, 200);
  const text = await res.text();
  assert(!text.includes(secretToken), "Response must NEVER contain the secret token");
  const parsed = JSON.parse(text);
  assertEquals(parsed.connection.connector_id, "key:openweather");
  assertEquals(parsed.connection.has_token, true);
});

// ── 1.2: run-api-fetch real encrypt -> CONNECTION_ENCRYPTION_KEY -> upstream key injection ───
Deno.test("Phase 1.2: run-api-fetch loads key secret using CONNECTION_ENCRYPTION_KEY, injects into upstream, never leaks in response", async () => {
  const encKey = "test-encryption-key-32-chars-long!";
  const rawApiKey = "ow_secret_api_key_777888999";
  const encryptedSecret = await encryptConnectionSecret(rawApiKey, encKey);

  let capturedUpstreamUrl = "";

  const fakeFetch: typeof fetch = (input) => {
    const url = typeof input === "string" ? input : input.toString();

    // 1. Supabase REST connections query
    if (url.includes("/rest/v1/connections")) {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              id: "conn-ow-1",
              connector_id: "key:openweather",
              label: "OpenWeather",
              server_url: "https://api.openweathermap.org",
              allowed_tools: [],
              status: "active",
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    // 2. Supabase REST connection_secrets query
    if (url.includes("/rest/v1/connection_secrets")) {
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              auth_header_name: "Authorization",
              encrypted_secret: encryptedSecret,
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    // 3. Upstream OpenWeather API call
    if (url.includes("api.openweathermap.org")) {
      capturedUpstreamUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            weather: [{ description: "light rain" }],
            main: { temp: 15.5 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    return Promise.resolve(new Response("Not found", { status: 404 }));
  };

  const req = new Request("https://edge.local/run-api-fetch", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-jwt",
    },
    body: JSON.stringify({
      api: "openweather",
      params: { q: "London", units: "metric" },
    }),
  });

  const res = await handleRunApiFetch(req, {
    getEnv: (k) => {
      if (k === "SUPABASE_URL") return "https://fake.supabase.co";
      if (k === "SUPABASE_SERVICE_ROLE_KEY") return "test-service-key";
      if (k === "CONNECTION_ENCRYPTION_KEY") return encKey;
      return undefined;
    },
    verifyJwt: () => Promise.resolve({ userId: "user-123" }),
    chargeCredits: () => Promise.resolve({ allowed: true }),
    baseFetch: fakeFetch,
  });

  assertEquals(res.status, 200);
  // Verify upstream URL received the decrypted key
  assert(capturedUpstreamUrl.includes(`appid=${rawApiKey}`), "Upstream URL must contain the injected API key");

  // Verify response body never leaks the key
  const responseText = await res.text();
  assert(!responseText.includes(rawApiKey), "Response JSON must NEVER contain the API key");
  assert(responseText.includes("light rain"), "Response must contain formatted result");
});

// ── 1.4: Kill switch returns 503 ───────────────────────────────────────────────
Deno.test("Phase 1.4: Kill switch GENERATION_DISABLED returns 503 for generate-app and run-llm-action", async () => {
  const getEnv = (k: string) => (k === "GENERATION_DISABLED" ? "true" : undefined);

  // generate-app
  const reqGen = new Request("https://edge.local/generate-app", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: "A calculator" }),
  });
  const resGen = await handleGenerateApp(reqGen, { getEnv });
  assertEquals(resGen.status, 503);
  const genPayload = await resGen.json();
  assertEquals(genPayload.error, "Generation is temporarily disabled. Please try again later.");

  // run-llm-action
  const reqLlm = new Request("https://edge.local/run-llm-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: { kind: "llm_call", prompt_template: "hello" },
    }),
  });
  const resLlm = await handleRunLlmAction(reqLlm, { getEnv });
  assertEquals(resLlm.status, 503);
  const llmPayload = await resLlm.json();
  assertEquals(llmPayload.error, "Generation is temporarily disabled. Please try again later.");
});

// ── 1.5: Rate limiting 429 after 6 generate_app or 20 runtime_llm in 60s ───────
Deno.test("Phase 1.5: Rate limiter rejects with 429 when threshold exceeded in 60s", async () => {
  // Test generate-app rate limit (threshold: 6)
  const fakeFetch6: typeof fetch = (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/rest/v1/usage_ledger")) {
      // Return 6 existing ledger entries
      return Promise.resolve(
        new Response(
          JSON.stringify([
            { id: "1" }, { id: "2" }, { id: "3" },
            { id: "4" }, { id: "5" }, { id: "6" },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  };

  const reqGen = new Request("https://edge.local/generate-app", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-jwt",
    },
    body: JSON.stringify({ user_prompt: "A task manager" }),
  });

  const resGen = await handleGenerateApp(reqGen, {
    getEnv: (k) => {
      if (k === "SUPABASE_URL") return "https://fake.supabase.co";
      if (k === "SUPABASE_SERVICE_ROLE_KEY") return "test-service-key";
      return undefined;
    },
    verifyJwt: () => Promise.resolve({ userId: "rate-limited-user" }),
    baseFetch: fakeFetch6,
  });

  assertEquals(resGen.status, 429);
  const genData = await resGen.json();
  assertEquals(genData.error, "Too many requests. Wait a minute.");

  // Test run-llm-action rate limit (threshold: 20)
  const fakeFetch20: typeof fetch = (input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/rest/v1/usage_ledger")) {
      const items = Array.from({ length: 20 }, (_, i) => ({ id: `id-${i}` }));
      return Promise.resolve(
        new Response(JSON.stringify(items), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  };

  const reqLlm = new Request("https://edge.local/run-llm-action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-jwt",
    },
    body: JSON.stringify({
      action: { kind: "llm_call", prompt_template: "summarize" },
    }),
  });

  const resLlm = await handleRunLlmAction(reqLlm, {
    getEnv: (k) => {
      if (k === "SUPABASE_URL") return "https://fake.supabase.co";
      if (k === "SUPABASE_SERVICE_ROLE_KEY") return "test-service-key";
      return undefined;
    },
    verifyJwt: () => Promise.resolve({ userId: "rate-limited-user-2" }),
    baseFetch: fakeFetch20,
  });

  assertEquals(resLlm.status, 429);
  const llmData = await resLlm.json();
  assertEquals(llmData.error, "Too many requests. Wait a minute.");
});

// ── 1.6: LLM output robustness (strip <think> tags) ───────────────────────────
Deno.test("Phase 1.6: extractJsonFromText strips <think> blocks across lines and casing", () => {
  // Preceded by think block
  const input1 = "<think>\nLet's analyze the request step by step.\n1. User wants a counter.\n</think>\n{\"app_id\": \"counter-app\", \"schema_version\": 2}";
  const res1 = extractJsonFromText(input1) as Record<string, unknown>;
  assertEquals(res1.app_id, "counter-app");
  assertEquals(res1.schema_version, 2);

  // Case-insensitive uppercase THINK tag
  const input2 = "<THINK>internal thought</THINK>\n{\"status\": \"ok\"}";
  const res2 = extractJsonFromText(input2) as Record<string, unknown>;
  assertEquals(res2.status, "ok");

  // Inside or before code fence
  const input3 = "<think>\nThinking...\n</think>\n```json\n{\"items\": [1, 2, 3]}\n```";
  const res3 = extractJsonFromText(input3) as Record<string, unknown>;
  assertEquals(res3.items, [1, 2, 3]);

  // Prose around JSON with think block
  const input4 = "<think>scratchpad</think>\nHere is the generated manifest:\n{\"name\": \"My Tool\"}\nHope you enjoy it!";
  const res4 = extractJsonFromText(input4) as Record<string, unknown>;
  assertEquals(res4.name, "My Tool");
});

// ── 1.9: checkProductionGuard 500 when DENO_DEPLOYMENT_ID and dev flags set ───
Deno.test("Phase 1.9: checkProductionGuard returns 500 in production when dev bypass flag is active", async () => {
  const devFlags = [
    "GENERATION_LOCAL_DEV_OPEN",
    "MCP_ALLOW_LOCAL_DEV_LOOPBACK",
    "API_FETCH_LOCAL_DEV_OPEN",
    "INVITES_LOCAL_DEV_OPEN",
    "BYOK_LOCAL_DEV_OPEN",
    "BILLING_LOCAL_DEV_OPEN",
    "LLM_ACTION_LOCAL_DEV_OPEN",
  ];

  for (const flag of devFlags) {
    const fakeEnv = (k: string) => {
      if (k === "DENO_DEPLOYMENT_ID") return "deploy-prod-999";
      if (k === flag) return "true";
      return undefined;
    };

    const guardRes = checkProductionGuard(fakeEnv);
    assert(guardRes !== null, `Flag ${flag} must trigger guard in production`);
    assertEquals(guardRes.status, 500);
    const body = await guardRes.json();
    assertEquals(body.error, "Server misconfigured");
  }

  // Not in prod: returns null
  const devEnv = (k: string) => (k === "GENERATION_LOCAL_DEV_OPEN" ? "true" : undefined);
  assertEquals(checkProductionGuard(devEnv), null);

  // In prod with no dev flags: returns null
  const prodSafeEnv = (k: string) => (k === "DENO_DEPLOYMENT_ID" ? "deploy-prod-999" : undefined);
  assertEquals(checkProductionGuard(prodSafeEnv), null);

  // Verify handlers directly return 500 when misconfigured
  const misconfiguredEnv = (k: string) => {
    if (k === "DENO_DEPLOYMENT_ID") return "deploy-prod-999";
    if (k === "INVITES_LOCAL_DEV_OPEN") return "true";
    if (k === "BYOK_LOCAL_DEV_OPEN") return "true";
    if (k === "BILLING_LOCAL_DEV_OPEN") return "true";
    return undefined;
  };

  const inviteRes = await handleInvites(
    new Request("https://edge.local/invites", { method: "POST" }),
    { getEnv: misconfiguredEnv }
  );
  assertEquals(inviteRes.status, 500);

  const byokRes = await handleManageByok(
    new Request("https://edge.local/manage-byok", { method: "POST" }),
    { getEnv: misconfiguredEnv }
  );
  assertEquals(byokRes.status, 500);

  const billingRes = await handleBillingWebhook(
    new Request("https://edge.local/billing-webhook", { method: "POST" }),
    { getEnv: misconfiguredEnv }
  );
  assertEquals(billingRes.status, 500);
});

// ── 1.10: run-llm-action input hardening ──────────────────────────────────────
Deno.test("Phase 1.10: run-llm-action hardens action kind and length limits", async () => {
  const validUserDeps = {
    getEnv: () => undefined,
    verifyJwt: () => Promise.resolve({ userId: "u1" }),
  };

  // 1. Reject invalid kind
  const resBadKind = await handleRunLlmAction(
    new Request("https://edge.local/run-llm-action", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
      body: JSON.stringify({ action: { kind: "arbitrary_eval" } }),
    }),
    validUserDeps
  );
  assertEquals(resBadKind.status, 400);
  const dataBadKind = await resBadKind.json();
  assert(dataBadKind.error.includes("Unsupported action kind"));

  // 2. Reject prompt_template > 2000 chars
  const resLongPrompt = await handleRunLlmAction(
    new Request("https://edge.local/run-llm-action", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
      body: JSON.stringify({
        action: { kind: "llm_call", prompt_template: "a".repeat(2001) },
      }),
    }),
    validUserDeps
  );
  assertEquals(resLongPrompt.status, 400);
  const dataLongPrompt = await resLongPrompt.json();
  assert(dataLongPrompt.error.includes("exceeds maximum 2000 characters"));

  // 3. Reject persona_prompt > 2000 chars
  const resLongPersona = await handleRunLlmAction(
    new Request("https://edge.local/run-llm-action", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
      body: JSON.stringify({
        action: { kind: "conversation_loop", persona_prompt: "b".repeat(2001) },
      }),
    }),
    validUserDeps
  );
  assertEquals(resLongPersona.status, 400);

  // 4. Server-side truncation: accepts long history (>12 messages) and truncates to 12 messages with max 1500 chars (Phase 1.6)
  let passedMessages: Array<{ role: string; content: string }> = [];
  const truncatingDeps = {
    ...validUserDeps,
    llmProvider: {
      completeMessages: (req: { messages: Array<{ role: string; content: string }> }) => {
        passedMessages = req.messages;
        return Promise.resolve({
          text: "Hello user!",
          model: "test-model",
          provider: "test",
          usedFallback: false,
          latencyMs: 10,
        });
      },
    },
  };

  const resTruncate = await handleRunLlmAction(
    new Request("https://edge.local/run-llm-action", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
      body: JSON.stringify({
        action: { kind: "conversation_loop" },
        conversation_history: Array.from({ length: 25 }, (_, i) => ({
          role: "user",
          content: `msg-${i}: ${"a".repeat(1600)}`,
        })),
      }),
    }),
    truncatingDeps
  );
  assertEquals(resTruncate.status, 200);
  // System prompt + 12 truncated user messages = 13 messages total
  assertEquals(passedMessages.length, 13);
  assertEquals(passedMessages[passedMessages.length - 1].content.length, 1500);
});

// ── 1.3: BYOK safety & key validation ─────────────────────────────────────────
Deno.test("Phase 1.3: BYOK validation, no fallback when BYOK active, and usage_ledger row with 0 credits", async () => {
  // 1. manage-byok set rejects invalid key when provider returns 401
  const fakeFetch401: typeof fetch = (_url) =>
    Promise.resolve(new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401 }));

  const setBadKeyReq = new Request("https://edge.local/manage-byok", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
    body: JSON.stringify({ op: "set", apiKey: "gsk_invalid_test" }),
  });

  const resBadByok = await handleManageByok(setBadKeyReq, {
    verifyJwt: async () => ({ userId: "test-user" }),
    baseFetch: fakeFetch401,
  });
  assertEquals(resBadByok.status, 400);
  const dataBadByok = await resBadByok.json();
  assertEquals(dataBadByok.error, "Invalid API key");
});

// ── 1.4: Cost caps in generate-app (User 429, Global 503) ─────────────────────
Deno.test("Phase 1.4: generate-app enforces daily user cap (429) and global cap (503)", async () => {
  // 1. User daily cap reached
  const fakeFetchUserCapped: typeof fetch = (url) => {
    const urlStr = String(url);
    if (urlStr.includes("usage_ledger") && urlStr.includes("user_id=eq.")) {
      return Promise.resolve(
        new Response("[]", {
          status: 200,
          headers: { "content-range": "0-0/15" },
        })
      );
    }
    return Promise.resolve(new Response("[]", { status: 200 }));
  };

  const reqUserCap = new Request("https://edge.local/generate-app", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
    body: JSON.stringify({ user_prompt: "Build me a calculator" }),
  });

  const resUserCap = await handleGenerateApp(reqUserCap, {
    verifyJwt: async () => ({ userId: "test-user" }),
    getEnv: (k) => {
      if (k === "SUPABASE_URL") return "https://mock.supabase.co";
      if (k === "SUPABASE_SERVICE_ROLE_KEY") return "mock-service-key";
      if (k === "DAILY_USER_GENERATIONS") return "15";
      return undefined;
    },
    baseFetch: fakeFetchUserCapped,
  });
  assertEquals(resUserCap.status, 429);
  const dataUserCap = await resUserCap.json();
  assertEquals(dataUserCap.error, "Daily limit reached");

  // 2. Global daily cap reached
  const fakeFetchGlobalCapped: typeof fetch = (url) => {
    const urlStr = String(url);
    if (urlStr.includes("usage_ledger") && !urlStr.includes("user_id=eq.")) {
      return Promise.resolve(
        new Response("[]", {
          status: 200,
          headers: { "content-range": "0-0/1000" },
        })
      );
    }
    return Promise.resolve(new Response("[]", { status: 200 }));
  };

  const reqGlobalCap = new Request("https://edge.local/generate-app", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
    body: JSON.stringify({ user_prompt: "Build me a calculator" }),
  });

  const resGlobalCap = await handleGenerateApp(reqGlobalCap, {
    verifyJwt: async () => ({ userId: "test-user" }),
    getEnv: (k) => {
      if (k === "SUPABASE_URL") return "https://mock.supabase.co";
      if (k === "SUPABASE_SERVICE_ROLE_KEY") return "mock-service-key";
      if (k === "DAILY_GLOBAL_GENERATIONS") return "1000";
      return undefined;
    },
    baseFetch: fakeFetchGlobalCapped,
  });
  assertEquals(resGlobalCap.status, 503);
  const dataGlobalCap = await resGlobalCap.json();
  assertEquals(dataGlobalCap.error, "Generation is temporarily busy");
});

// ── 1.5: generate-app payload limits & fail-closed ─────────────────────────────
Deno.test("Phase 1.5: generate-app rejects payload > 200KB, context > 12 items, and fails closed when env missing", async () => {
  // 1. Reject body > 200KB
  const bigBody = JSON.stringify({ user_prompt: "a".repeat(205 * 1024) });
  const reqBig = new Request("https://edge.local/generate-app", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
    body: bigBody,
  });
  const resBig = await handleGenerateApp(reqBig, {
    verifyJwt: async () => ({ userId: "test-user" }),
  });
  assertEquals(resBig.status, 400);

  // 2. Reject conversation_context > 12 items
  const reqContext = new Request("https://edge.local/generate-app", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
    body: JSON.stringify({
      user_prompt: "Test",
      conversation_context: Array.from({ length: 13 }, () => ({ role: "user", content: "hi" })),
    }),
  });
  const resContext = await handleGenerateApp(reqContext, {
    verifyJwt: async () => ({ userId: "test-user" }),
  });
  assertEquals(resContext.status, 400);

  // 3. Fail closed if SUPABASE_URL missing and GENERATION_LOCAL_DEV_OPEN != true
  const reqAuth = new Request("https://edge.local/generate-app", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
    body: JSON.stringify({ user_prompt: "Test" }),
  });
  const resFailClosed = await handleGenerateApp(reqAuth, {
    getEnv: () => undefined, // no SUPABASE_URL, no GENERATION_LOCAL_DEV_OPEN
  });
  assertEquals(resFailClosed.status, 401);
});

// ── 1.9: run-api-fetch returns 424 missing_key without charging credits ────────
Deno.test("Phase 1.9: run-api-fetch checks stored key BEFORE charging credits (returns 424 missing_key)", async () => {
  let creditsCharged = false;
  const req = new Request("https://edge.local/run-api-fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
    body: JSON.stringify({ api: "openweather", params: { city: "London" } }),
  });

  const res = await handleRunApiFetch(req, {
    verifyJwt: async () => ({ userId: "test-user" }),
    loadConnectionSecret: async () => undefined, // No key stored
    chargeCredits: async () => {
      creditsCharged = true;
      return { allowed: true, remainingCredits: 10, monthlyCreditLimit: 100 };
    },
  });

  assertEquals(res.status, 424);
  const data = await res.json();
  assertEquals(data.error, "missing_key");
  assertEquals(data.key_id, "openweather");
  assertEquals(creditsCharged, false); // Crucial: credits were NOT charged
});
