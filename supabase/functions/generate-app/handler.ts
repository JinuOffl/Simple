import { corsHeaders } from "../_shared/cors.ts";
import { consumeCreditsRpc, refundCreditsRpc } from "../_shared/credits.ts";
import { getCreditCostForClass } from "../_shared/plans.ts";
import { VercelAiFallbackProvider } from "../_shared/llmProvider.ts";
import { validateManifestDeno } from "../_shared/manifestValidator.ts";
import { resolveLlmRuntimeConfig } from "../_shared/orchestrator/llmConfig.ts";
import { runGenerateOrchestrator } from "../_shared/orchestrator/stateMachine.ts";
import { fetchUserByokKey } from "../_shared/byokHelper.ts";
import { checkProductionGuard } from "../_shared/prodGuard.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
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

  // Web-first local dev mode: open local dev flag must be explicitly set
  if (localDevOpen) {
    return { userId: "local-dev-user", enforceSupabaseCredits: false };
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return null; // fail closed
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

  const prodGuardResponse = checkProductionGuard(getEnv);
  if (prodGuardResponse) return prodGuardResponse;

  if (getEnv("GENERATION_DISABLED") === "true") {
    return jsonResponse(
      { error: "Generation is temporarily disabled. Please try again later." },
      503
    );
  }

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

  let rawText = "";
  try {
    rawText = await req.text();
  } catch {
    return jsonResponse({ error: "Failed to read request body" }, 400);
  }

  // Reject body > 200KB (Phase 1.5)
  if (rawText.length > 200 * 1024) {
    return jsonResponse({ error: "Request body exceeds 200KB limit" }, 400);
  }

  let body: GenerateAppRequestPayload;
  try {
    body = JSON.parse(rawText) as GenerateAppRequestPayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const userPrompt = typeof body.user_prompt === "string" ? body.user_prompt : "";
  if (!userPrompt.trim()) {
    return jsonResponse({ error: "user_prompt is required" }, 400);
  }

  if (body.existing_manifest) {
    // Reject existing_manifest > 100KB (Phase 1.5)
    if (JSON.stringify(body.existing_manifest).length > 100 * 1024) {
      return jsonResponse({ error: "existing_manifest exceeds 100KB limit" }, 400);
    }

    const existingSchemaVersion = (body.existing_manifest as unknown as Record<string, unknown>).schema_version;
    if (existingSchemaVersion !== 2) {
      return jsonResponse(
        {
          error: `Invalid existing_manifest: schema_version must be 2 (received ${existingSchemaVersion ?? "undefined"}). Convert v1 manifests before sending.`,
        },
        400
      );
    }
  }

  // Validate conversation_context: max 12 items, max 2000 chars per item (Phase 1.5)
  if (body.conversation_context !== undefined) {
    if (!Array.isArray(body.conversation_context)) {
      return jsonResponse({ error: "conversation_context must be an array" }, 400);
    }
    if (body.conversation_context.length > 12) {
      return jsonResponse({ error: "conversation_context exceeds maximum 12 items" }, 400);
    }
    for (const item of body.conversation_context) {
      if (item && typeof item.content === "string" && item.content.length > 2000) {
        return jsonResponse({ error: "conversation_context content exceeds maximum 2000 characters" }, 400);
      }
    }
  }

  const supabaseUrl = getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const encryptionSecret =
    getEnv("CONNECTION_ENCRYPTION_KEY") ??
    getEnv("BYOK_ENCRYPTION_KEY") ??
    getEnv("APP_ENCRYPTION_KEY");

  // Check if caller has configured their own BYOK key (bypasses credit limits)
  const byok = await fetchUserByokKey({
    supabaseUrl,
    serviceRoleKey,
    userId,
    encryptionSecret,
    fetchFn: baseFetch,
  });

  if (enforceSupabaseCredits && supabaseUrl && serviceRoleKey) {
    const withinRateLimit = await checkRateLimit({
      supabaseUrl,
      serviceRoleKey,
      userId,
      target: "generate_app",
      limit: 6,
      fetchFn: baseFetch,
      now: deps.now ? deps.now() : undefined,
    });
    if (!withinRateLimit) {
      return jsonResponse({ error: "Too many requests. Wait a minute." }, 429);
    }

    // ── Cost caps: daily per-user & global generation caps (Phase 1.4) ────────
    if (userId !== "local-dev-user") {
      const now = new Date(deps.now ? deps.now() : Date.now());
      const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
      const userLimit = Number(getEnv("DAILY_USER_GENERATIONS") ?? "15");
      const globalLimit = Number(getEnv("DAILY_GLOBAL_GENERATIONS") ?? "1000");

      const restBase = supabaseUrl.replace(/\/+$/, "") + "/rest/v1";
      const headers = {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "count=exact",
        Range: "0-0",
      };

      // 1. User daily cap
      const userCountRes = await baseFetch(
        `${restBase}/usage_ledger?user_id=eq.${encodeURIComponent(userId)}&action=in.(generate_app,generation)&created_at=gte.${encodeURIComponent(startOfUtcDay)}&select=id`,
        { headers }
      );
      if (userCountRes.ok) {
        const range = userCountRes.headers.get("content-range") ?? "";
        const match = /\/(\d+)$/.exec(range);
        const count = match ? parseInt(match[1], 10) : 0;
        if (count >= userLimit) {
          return jsonResponse({ error: "Daily limit reached" }, 429);
        }
      }

      // 2. Global daily cap
      const globalCountRes = await baseFetch(
        `${restBase}/usage_ledger?action=in.(generate_app,generation)&created_at=gte.${encodeURIComponent(startOfUtcDay)}&select=id`,
        { headers }
      );
      if (globalCountRes.ok) {
        const range = globalCountRes.headers.get("content-range") ?? "";
        const match = /\/(\d+)$/.exec(range);
        const count = match ? parseInt(match[1], 10) : 0;
        if (count >= globalLimit) {
          return jsonResponse({ error: "Generation is temporarily busy" }, 503);
        }
      }
    }
  }

  // ── Record BYOK usage ledger row with 0 credits charged (Phase 1.3) ─────────
  if (enforceSupabaseCredits && supabaseUrl && serviceRoleKey && byok.hasByok && userId !== "local-dev-user") {
    try {
      await baseFetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/usage_ledger`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          user_id: userId,
          action: "generate_app",
          cost_class: "generation",
          credits_charged: 0,
          metadata: { byok: true },
        }),
      });
    } catch (ledgerErr) {
      console.warn("Failed to insert BYOK usage ledger row:", ledgerErr);
    }
  }

  if (enforceSupabaseCredits && supabaseUrl && serviceRoleKey && !byok.hasByok) {
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

  const runtimeConfig = resolveLlmRuntimeConfig(
    getEnv,
    undefined,
    byok.hasByok ? { apiKey: byok.apiKey, provider: byok.provider } : undefined
  );
  const llmProvider =
    deps.llmProvider ?? new VercelAiFallbackProvider({ runtimeConfig, baseFetch });

  let result: GenerationResult;
  try {
    result = await runGenerateOrchestrator(
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
  } catch {
    if (enforceSupabaseCredits && supabaseUrl && serviceRoleKey && !byok.hasByok) {
      try {
        await refundCreditsRpc({
          supabaseUrl,
          serviceRoleKey,
          userId,
          cost: 5,
          actionKind: body.existing_manifest ? "edit_app" : "generate_app",
          fetchFn: baseFetch,
        });
      } catch (refundErr) {
        console.warn("Failed to refund credits after generator throw:", refundErr);
      }
    }
    return jsonResponse({ error: "Generation failed" }, 500);
  }

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

  if (enforceSupabaseCredits && supabaseUrl && serviceRoleKey && !byok.hasByok) {
    try {
      await refundCreditsRpc({
        supabaseUrl,
        serviceRoleKey,
        userId,
        cost: getCreditCostForClass("generation"),
        actionKind: "generate_app",
        appId: body.app_id,
        fetchFn: baseFetch,
      });
    } catch {
      // Best-effort refund
    }
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

