import { corsHeaders } from "../_shared/cors.ts";
import { consumeCreditsRpc } from "../_shared/credits.ts";
import { createEnvBackedLlmProvider } from "../_shared/llmProvider.ts";
import { validateManifestDeno } from "../_shared/manifestValidator.ts";
import { resolveLlmRuntimeConfig } from "../_shared/orchestrator/llmConfig.ts";
import { runGenerateOrchestrator } from "../_shared/orchestrator/stateMachine.ts";
import type {
  ConversationTurn,
  GenerationResult,
  LLMProvider,
  ManifestV2Like,
  ValidationResult,
} from "../_shared/orchestrator/types.ts";

export interface GenerateAppRequestPayload {
  user_prompt?: string;
  existing_manifest?: ManifestV2Like;
  conversation_context?: ConversationTurn[];
  app_id?: string;
}

export interface GenerateAppDeps {
  getEnv?: (key: string) => string | undefined;
  verifyJwt?: (authHeader: string) => Promise<{ userId: string } | null>;
  llmProvider?: LLMProvider;
  validateManifest?: (raw: unknown) => ValidationResult;
  baseFetch?: typeof fetch;
  now?: () => number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function resolveCallerUserId(
  authHeader: string,
  getEnv: (key: string) => string | undefined,
  baseFetch: typeof fetch
): Promise<{ userId: string; enforceSupabaseCredits: boolean } | null> {
  const localDevOpen = getEnv("GENERATION_LOCAL_DEV_OPEN") === "true";
  const supabaseUrl = getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY") ?? getEnv("VITE_SUPABASE_ANON_KEY");

  // Web-first local dev mode: if Supabase auth isn't configured OR open local dev flag is set
  if (localDevOpen || !supabaseUrl || !supabaseAnonKey) {
    return { userId: "local-dev-user", enforceSupabaseCredits: false };
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
    return data.id ? { userId: data.id, enforceSupabaseCredits: true } : null;
  } catch {
    return null;
  }
}

async function recordGenerationJobBestEffort(args: {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  userId: string;
  appId?: string;
  prompt: string;
  result: GenerationResult;
  fetchFn: typeof fetch;
}): Promise<void> {
  if (!args.supabaseUrl || !args.serviceRoleKey || args.userId === "local-dev-user") {
    return;
  }

  try {
    const endpoint = `${args.supabaseUrl.replace(/\/+$/, "")}/rest/v1/generation_jobs`;
    const res = await args.fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: args.serviceRoleKey,
        Authorization: `Bearer ${args.serviceRoleKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        user_id: args.userId,
        app_id: args.appId ?? null,
        prompt: args.prompt.slice(0, 1000),
        state: args.result.state,
        error: args.result.error ?? null,
        metadata: {
          transitions: args.result.trace.transitions,
          total_latency_ms: args.result.trace.totalLatencyMs,
          repair_attempts: args.result.trace.repairAttempts,
          used_fallback: args.result.trace.usedFallbackProvider,
          template_matched: args.result.trace.templateMatch.slug ?? null,
          edit_mode: args.result.trace.editMode,
        },
      }),
    });
    await res.body?.cancel();
  } catch {
    // Non-blocking audit log
  }
}

export async function handleGenerateApp(
  req: Request,
  deps: GenerateAppDeps = {}
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

  let userId = "local-dev-user";
  let enforceSupabaseCredits = false;
  if (deps.verifyJwt) {
    const verified = await deps.verifyJwt(authHeader);
    if (!verified) return jsonResponse({ error: "Unauthorized" }, 401);
    userId = verified.userId;
    enforceSupabaseCredits = Boolean(
      (getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL")) && getEnv("SUPABASE_SERVICE_ROLE_KEY")
    );
  } else {
    const resolved = await resolveCallerUserId(authHeader, getEnv, baseFetch);
    if (!resolved) return jsonResponse({ error: "Unauthorized" }, 401);
    userId = resolved.userId;
    enforceSupabaseCredits = resolved.enforceSupabaseCredits;
  }

  let body: GenerateAppRequestPayload;
  try {
    body = (await req.json()) as GenerateAppRequestPayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const userPrompt = typeof body.user_prompt === "string" ? body.user_prompt : "";
  if (!userPrompt.trim()) {
    return jsonResponse({ error: "user_prompt is required" }, 400);
  }

  const supabaseUrl = getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (enforceSupabaseCredits && supabaseUrl && serviceRoleKey) {
    try {
      const creditCheck = await consumeCreditsRpc({
        supabaseUrl,
        serviceRoleKey,
        userId,
        actionKind: "generate_app",
        costClass: "generation",
        appId: body.app_id,
        metadata: { edit_mode: Boolean(body.existing_manifest) },
        fetchFn: baseFetch,
      });
      if (!creditCheck.allowed) {
        return jsonResponse(
          {
            error: "Insufficient monthly credits for app generation. Upgrade plan or wait for reset.",
            remaining_credits: creditCheck.remainingCredits,
            monthly_credit_limit: creditCheck.monthlyCreditLimit,
          },
          402
        );
      }
    } catch (err) {
      return jsonResponse(
        {
          error: err instanceof Error ? err.message : "Failed to verify credit balance",
        },
        500
      );
    }
  }

  const runtimeConfig = resolveLlmRuntimeConfig(getEnv);
  const llmProvider =
    deps.llmProvider ?? createEnvBackedLlmProvider(getEnv, deps.baseFetch);

  const result = await runGenerateOrchestrator(
    {
      userPrompt,
      existingManifest: body.existing_manifest,
      conversationContext: Array.isArray(body.conversation_context)
        ? body.conversation_context
        : [],
    },
    {
      llmProvider,
      config: runtimeConfig,
      validateManifest: deps.validateManifest ?? validateManifestDeno,
      now: deps.now,
    }
  );

  await recordGenerationJobBestEffort({
    supabaseUrl,
    serviceRoleKey,
    userId,
    appId: body.app_id,
    prompt: userPrompt,
    result,
    fetchFn: baseFetch,
  });

  if (result.ok) {
    return jsonResponse(result, 200);
  }

  if (result.unsupported) {
    return jsonResponse(
      {
        ...result,
        code: "UNSUPPORTED_REQUEST",
      },
      422
    );
  }

  return jsonResponse(
    {
      ...result,
      code: result.trace.failureKind?.toUpperCase() ?? "GENERATION_FAILED",
    },
    result.trace.failureKind === "invalid_input" ? 400 : 422
  );
}

