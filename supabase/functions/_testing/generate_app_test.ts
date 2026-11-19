import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { resolveLlmRuntimeConfig } from "../_shared/orchestrator/llmConfig.ts";
import { VercelAiFallbackProvider } from "../_shared/llmProvider.ts";
import { validateManifestDeno } from "../_shared/manifestValidator.ts";
import { encryptConnectionSecret } from "../_shared/secretCrypto.ts";
import { handleGenerateApp } from "../generate-app/handler.ts";
import { STARTER_TEMPLATES } from "../_shared/orchestrator/templates.ts";

function makeOpenAiJsonResponse(content: unknown, model = "llama-3.3-70b-versatile"): Response {
  const payload = {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: typeof content === "string" ? content : JSON.stringify(content),
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 40,
      total_tokens: 60,
    },
  };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.test("VercelAiFallbackProvider uses primary Groq config and fails over cleanly to fallback endpoint", async () => {
  const calledUrls: string[] = [];
  const calledModels: string[] = [];

  const mockFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calledUrls.push(url);
    if (init?.body && typeof init.body === "string") {
      const parsed = JSON.parse(init.body) as { model?: string };
      if (parsed.model) calledModels.push(parsed.model);
    }

    if (url.includes("api.groq.com")) {
      return new Response(JSON.stringify({ error: { message: "Groq temporary 503" } }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("fallback.example.test")) {
      return makeOpenAiJsonResponse({ pass: true, issues: [], summary: "Fallback worked" }, "fallback-mini");
    }

    if (url.includes("/rest/v1/usage_ledger")) {
      return Promise.resolve(
        new Response("[]", { status: 200, headers: { "Content-Type": "application/json", "content-range": "0-0/0" } })
      );
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const envMap: Record<string, string> = {
    GROQ_API_KEY: "test-groq-key",
    GENERATION_MODEL: "custom-groq-70b",
    CRITIQUE_MODEL: "custom-groq-8b",
    LLM_FALLBACK_PROVIDER: "fallback-openai",
    LLM_FALLBACK_BASE_URL: "https://fallback.example.test/v1",
    LLM_FALLBACK_API_KEY: "test-fallback-key",
    LLM_FALLBACK_CRITIQUE_MODEL: "fallback-mini",
  };

  const runtimeConfig = resolveLlmRuntimeConfig((k) => envMap[k]);
  const provider = new VercelAiFallbackProvider({ runtimeConfig, baseFetch: mockFetch });

  const result = await provider.completeJson<{ pass: boolean }>({
    role: "critique",
    system: "Return critique JSON.",
    prompt: "Evaluate manifest",
  });

  assertEquals(result.data.pass, true);
  assertEquals(result.usedFallback, true);
  assertEquals(result.provider, "fallback-openai");
  assertEquals(result.model, "fallback-mini");
  assertEquals(calledUrls.some((u) => u.includes("api.groq.com")), true);
  assertEquals(calledUrls.some((u) => u.includes("fallback.example.test")), true);
  assertEquals(calledModels.includes("custom-groq-8b"), true);
  assertEquals(calledModels.includes("fallback-mini"), true);
});

Deno.test("handleGenerateApp supports create, RFC 6902 edit patch, and honest unsupported refusal over HTTP", async () => {
  const weatherBase = structuredClone(
    STARTER_TEMPLATES.find((t) => t.slug === "weather-forecast")!.manifest
  );

  const envMap: Record<string, string> = {
    GENERATION_LOCAL_DEV_OPEN: "true",
    GROQ_API_KEY: "test-groq-key",
  };

  const mockFetch: typeof fetch = async (_input, init) => {
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    const messagesText = JSON.stringify(body.messages ?? "");

    if (messagesText.includes("semantic QA reviewer")) {
      return makeOpenAiJsonResponse({ pass: true, issues: [] });
    }
    if (messagesText.includes("RFC 6902 JSON Patch")) {
      return makeOpenAiJsonResponse({
        operations: [
          { op: "replace", path: "/name", value: "Patched Weather" },
        ],
      });
    }
    return makeOpenAiJsonResponse({ ...weatherBase, app_id: "deno-weather-app" });
  };

  // 1. OPTIONS preflight
  const optRes = await handleGenerateApp(
    new Request("http://localhost/generate-app", { method: "OPTIONS" })
  );
  assertEquals(optRes.status, 200);

  // 2. Create valid app
  const createRes = await handleGenerateApp(
    new Request("http://localhost/generate-app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_prompt: "Build a London weather checker" }),
    }),
    { getEnv: (k) => envMap[k], baseFetch: mockFetch }
  );
  assertEquals(createRes.status, 200);
  const createJson = await createRes.json();
  assertEquals(createJson.ok, true);
  assertEquals(createJson.state, "DONE");
  assertExists(createJson.manifest);
  assertEquals(createJson.manifest.app_id, "deno-weather-app");

  // 3. Edit app via RFC 6902 patch preserving node IDs
  const editRes = await handleGenerateApp(
    new Request("http://localhost/generate-app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_prompt: "Rename app to Patched Weather",
        existing_manifest: weatherBase,
      }),
    }),
    { getEnv: (k) => envMap[k], baseFetch: mockFetch }
  );
  assertEquals(editRes.status, 200);
  const editJson = await editRes.json();
  assertEquals(editJson.ok, true);
  assertEquals(editJson.trace.editMode, true);
  assertEquals(editJson.trace.patchApplied, true);
  assertEquals(editJson.manifest.name, "Patched Weather");
  assertEquals(editJson.manifest.screens[0].nodes[0].id, "weather_card");

  // 4. Honest refusal without LLM call
  const honestRes = await handleGenerateApp(
    new Request("http://localhost/generate-app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_prompt: "Create an end-to-end encrypted WhatsApp replacement",
      }),
    }),
    {
      getEnv: (k) => envMap[k],
      baseFetch: () => Promise.reject(new Error("Should not hit LLM")),
    }
  );
  assertEquals(honestRes.status, 422);
  const honestJson = await honestRes.json();
  assertEquals(honestJson.ok, false);
  assertEquals(honestJson.code, "UNSUPPORTED_REQUEST");
  assertExists(honestJson.unsupported?.message);
  assertExists(honestJson.unsupported?.alternative);
});

Deno.test("handleGenerateApp enforces auth and 402 credits when Supabase service env is configured", async () => {
  const envMap: Record<string, string> = {
    SUPABASE_URL: "https://proj.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    GROQ_API_KEY: "test-groq-key",
  };

  // Missing Authorization header -> 401
  const unauthRes = await handleGenerateApp(
    new Request("http://localhost/generate-app", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_prompt: "Build a calculator" }),
    }),
    { getEnv: (k) => envMap[k] }
  );
  assertEquals(unauthRes.status, 401);

  // Authenticated user with 0 credits remaining -> 402
  const noCreditsFetch: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "user-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/rest/v1/rpc/consume_credits")) {
      return new Response(
        JSON.stringify([
          {
            allowed: false,
            remaining_credits: 1,
            credits_used: 99,
            monthly_credit_limit: 100,
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/rest/v1/usage_ledger")) {
      return Promise.resolve(
        new Response("[]", { status: 200, headers: { "Content-Type": "application/json", "content-range": "0-0/0" } })
      );
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const paywallRes = await handleGenerateApp(
    new Request("http://localhost/generate-app", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer valid-jwt",
      },
      body: JSON.stringify({ user_prompt: "Build a calculator" }),
    }),
    { getEnv: (k) => envMap[k], baseFetch: noCreditsFetch }
  );
  assertEquals(paywallRes.status, 402);
  const paywallJson = await paywallRes.json();
  assertEquals(paywallJson.remaining_credits, 1);
});

Deno.test("validateManifestDeno accepts shared:false and image_ref field type in data.collections", () => {
  const manifest = {
    schema_version: 2,
    app_id: "test-app-parity",
    name: "Parity App",
    icon: "📷",
    permissions: [],
    connectors: [],
    data: {
      collections: [
        {
          name: "t",
          shared: false,
          fields: [{ name: "p", type: "image_ref" }],
        },
      ],
    },
    screens: [{ id: "main", title: "Main", nodes: [] }],
    actions: [],
  };

  const res = validateManifestDeno(manifest);
  assertEquals(res.kind, "valid");
});

Deno.test("validateManifestDeno accepts valid tool field and preserves backwards compatibility", () => {
  const base = {
    schema_version: 2,
    app_id: "test-tool-meta",
    name: "Tool With Meta",
    icon: "🧰",
    permissions: [],
    connectors: [],
    data: { collections: [] },
    screens: [{ id: "main", title: "Main", nodes: [] }],
    actions: [],
  };

  // 1. Without tool field (backward compatible)
  const withoutTool = validateManifestDeno(base);
  assertEquals(withoutTool.kind, "valid");

  // 2. With valid tool size and requires
  const withTool = validateManifestDeno({
    ...base,
    tool: {
      size: "4x2",
      requires: [{ key_id: "api_key", label: "External API Key" }],
    },
  });
  assertEquals(withTool.kind, "valid");

  // 3. With invalid tool size
  const withInvalidSize = validateManifestDeno({
    ...base,
    tool: { size: "invalid_size" },
  });
  assertEquals(withInvalidSize.kind, "invalid");
});

Deno.test("handleGenerateApp rejects non-v2 existing_manifest with status 400", async () => {
  const req = new Request("http://localhost/generate-app", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_prompt: "Add a button",
      existing_manifest: {
        schema_version: 1,
        app_id: "legacy-v1-app",
        name: "Legacy App",
      },
    }),
  });

  const res = await handleGenerateApp(req, {
    getEnv: (k) => (k === "GENERATION_LOCAL_DEV_OPEN" ? "true" : undefined),
  });

  assertEquals(res.status, 400);
  const json = await res.json();
  assertEquals(json.error.includes("schema_version must be 2"), true);
});

Deno.test("handleGenerateApp uses BYOK key as Authorization bearer for the primary endpoint", async () => {
  const encryptionKey = "test-encryption-key-for-byok-test-32b";
  const userByokKey = "gsk_custom_user_byok_key_12345";
  const encrypted = await encryptConnectionSecret(userByokKey, encryptionKey);

  const envMap: Record<string, string> = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_ANON_KEY: "anon-test-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-test-key",
    CONNECTION_ENCRYPTION_KEY: encryptionKey,
  };

  const capturedAuthHeaders: string[] = [];

  const mockFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "user-byok-1" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/rest/v1/byok_secrets")) {
      return new Response(
        JSON.stringify([{ encrypted_secret: encrypted, provider: "groq" }]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.includes("/rest/v1/generation_jobs")) {
      return new Response(JSON.stringify({}), { status: 201 });
    }

    if (url.includes("api.groq.com")) {
      const headers = init?.headers;
      let auth = "";
      if (headers instanceof Headers) {
        auth = headers.get("Authorization") ?? "";
      } else if (Array.isArray(headers)) {
        auth = headers.find(([k]) => k.toLowerCase() === "authorization")?.[1] ?? "";
      } else if (headers && typeof headers === "object") {
        auth = (headers as Record<string, string>)["Authorization"] ?? (headers as Record<string, string>)["authorization"] ?? "";
      }
      capturedAuthHeaders.push(auth);

      const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
      const messagesText = JSON.stringify(body.messages ?? "");
      if (messagesText.includes("semantic QA reviewer")) {
        return makeOpenAiJsonResponse({ pass: true, issues: [] });
      }
      return makeOpenAiJsonResponse(STARTER_TEMPLATES[0].manifest);
    }

    if (url.includes("/rest/v1/usage_ledger")) {
      return Promise.resolve(
        new Response("[]", { status: 200, headers: { "Content-Type": "application/json", "content-range": "0-0/0" } })
      );
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const res = await handleGenerateApp(
    new Request("http://localhost/generate-app", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer user-token",
      },
      body: JSON.stringify({ user_prompt: "Create a world clock app" }),
    }),
    {
      getEnv: (k) => envMap[k],
      baseFetch: mockFetch,
    }
  );

  assertEquals(res.status, 200);
  assertEquals(capturedAuthHeaders.length > 0, true);
  assertEquals(capturedAuthHeaders[0], `Bearer ${userByokKey}`);
});

Deno.test("VercelAiFallbackProvider passes response_format json_object for generation and critique roles but not runtime", async () => {
  const capturedBodies: Array<Record<string, unknown>> = [];
  const mockFetch: typeof fetch = async (_input, init) => {
    if (init?.body && typeof init.body === "string") {
      capturedBodies.push(JSON.parse(init.body));
    }
    return makeOpenAiJsonResponse({ ok: true });
  };

  const runtimeConfig = resolveLlmRuntimeConfig((k) => {
    if (k === "GROQ_API_KEY") return "test-groq-key";
    return undefined;
  });

  const provider = new VercelAiFallbackProvider({ runtimeConfig, baseFetch: mockFetch });

  // 1. generation role
  await provider.completeJson({
    role: "generation",
    system: "sys",
    prompt: "gen",
  });

  // 2. critique role
  await provider.completeJson({
    role: "critique",
    system: "sys",
    prompt: "crit",
  });

  // 3. runtime role (messages)
  await provider.completeMessages({
    role: "runtime",
    messages: [{ role: "user", content: "hello" }],
  });

  assertEquals(capturedBodies.length, 3);
  assertEquals(capturedBodies[0].response_format, { type: "json_object" });
  assertEquals(capturedBodies[1].response_format, { type: "json_object" });
  assertEquals(capturedBodies[2].response_format, undefined);
});





