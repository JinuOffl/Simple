import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { resolveLlmRuntimeConfig } from "../_shared/orchestrator/llmConfig.ts";
import { VercelAiFallbackProvider } from "../_shared/llmProvider.ts";
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

