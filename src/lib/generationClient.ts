import { supabase } from "./supabaseClient";
import type { Manifest } from "@/schema/manifest.v1";
import type { ManifestV2 } from "@/schema/manifest.v2";
import { ManifestSchema } from "@/schema/manifest.v1";
import { ManifestV2Schema } from "@/schema/manifest.v2";
import { needsMigration, migrateV1toV2 } from "@/schema/migrator";
import { KeywordTemplateMatcher } from "../../supabase/functions/_shared/orchestrator/templates.ts";
import { healManifest } from "../../supabase/functions/_shared/orchestrator/heal.ts";
import { runGenerateOrchestrator } from "../../supabase/functions/_shared/orchestrator/stateMachine.ts";
import { BrowserGroqLlmProvider } from "./browserLlmProvider";
import { logGeneration } from "./generationLog";
import type {
  ConversationTurn,
  ManifestV2Like,
  ValidationResult,
} from "../../supabase/functions/_shared/orchestrator/types.ts";

async function readInvokeError(error: unknown): Promise<{ message: string; body?: Record<string, unknown> }> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.clone === "function") {
    try {
      const body = (await ctx.clone().json()) as Record<string, unknown>;
      const message = typeof body.error === "string" ? body.error : (error as Error).message;
      return { message, body };
    } catch { /* fall through */ }
  }
  return { message: (error as Error)?.message ?? String(error) };
}

export interface GenerateAppParams {
  userPrompt: string;
  existingManifest?: Manifest | ManifestV2 | null;
  conversationContext?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface GenerationClientResult {
  ok: boolean;
  manifest?: Manifest | ManifestV2;
  error?: string;
  unsupported?: { message?: string; alternative?: string };
  trace?: unknown;
  patch?: unknown[];
  diagnostics?: unknown;
  tier?: "local" | "edge" | "browser" | "template";
}

function parseManifestPayload(payload: unknown, fallbackExisting?: unknown): Manifest | ManifestV2 | null {
  if (!payload || typeof payload !== "object") return null;

  const v2Parse = ManifestV2Schema.safeParse(payload);
  if (v2Parse.success) return v2Parse.data;

  const v1Parse = ManifestSchema.safeParse(payload);
  if (v1Parse.success) return v1Parse.data;

  // Attempt automatic schema repair for LLM deviations
  const repaired = healManifest(payload, fallbackExisting);
  if (repaired) {
    const repairedV2 = ManifestV2Schema.safeParse(repaired);
    if (repairedV2.success) return repairedV2.data;

    const repairedV1 = ManifestSchema.safeParse(repaired);
    if (repairedV1.success) return repairedV1.data;
  }

  return null;
}

function getClientGroqKey(): string {
  if (!import.meta.env.DEV) {
    return "";
  }
  const envKey = (import.meta.env.VITE_GROQ_API_KEY as string | undefined) ?? "";
  if (envKey.trim()) return envKey.trim();

  try {
    const stored = localStorage.getItem("simple_byok_key");
    if (stored) return stored.trim();
  } catch {
    // ignore
  }

  return "";
}

function validateWithAppZodSchema(raw: unknown): ValidationResult {
  const parsed = parseManifestPayload(raw);
  if (parsed) {
    return { kind: "valid", manifest: parsed as ManifestV2Like };
  }
  const v2 = ManifestV2Schema.safeParse(raw);
  if (!v2.success) {
    return {
      kind: "invalid",
      errors: v2.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`),
    };
  }
  return { kind: "invalid", errors: ["Manifest failed schema validation"] };
}

/**
 * Invoke app generation with a resilient fallback chain:
 * 1. Local Deno dev server (/local-functions/generate-app) if running
 * 2. Supabase Edge Function (generate-app) if deployed
 * 3. In-browser direct Groq API compilation (if GROQ_API_KEY is configured)
 * 4. In-browser deterministic template matcher / offline fallback
 */
export async function generateAppWithFallback(
  params: GenerateAppParams
): Promise<GenerationClientResult> {
  const userPrompt = params.userPrompt;
  const conversationContext = params.conversationContext;
  const existingManifest = params.existingManifest
    ? (needsMigration(params.existingManifest) ? migrateV1toV2(params.existingManifest) : params.existingManifest)
    : undefined;
  const startTime = Date.now();
  const existingManifestBytes = existingManifest
    ? new TextEncoder().encode(JSON.stringify(existingManifest)).length
    : 0;

  const {
    data: { session: callerSession },
  } = await supabase.auth.getSession();
  const callerUser = callerSession?.user;

  const recordAndReturn = (result: GenerationClientResult): GenerationClientResult => {
    const traceObj = result.trace as Record<string, unknown> | undefined;
    const diagObj = result.diagnostics as Record<string, unknown> | undefined;
    logGeneration({
      tier: result.tier,
      userPrompt,
      existingManifestBytes,
      ok: result.ok,
      error: result.error,
      validationErrors: Array.isArray(diagObj?.validationErrors)
        ? (diagObj.validationErrors as string[])
        : undefined,
      repairAttempts:
        typeof traceObj?.repairAttempts === "number"
          ? traceObj.repairAttempts
          : undefined,
      latencyMs: Date.now() - startTime,
    });
    return result;
  };

  const localEndpoint =
    import.meta.env.VITE_LOCAL_GENERATE_APP_URL ??
    (import.meta.env.DEV ? "/local-functions/generate-app" : undefined);

  // ── 1. Try local dev server endpoint first (npm run dev:mcp) ──────────────────
  if (localEndpoint) {
    try {
      const bearer = callerSession?.access_token ?? "local-dev-user";

      const res = await fetch(localEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bearer}`,
        },
        body: JSON.stringify({
          user_prompt: userPrompt,
          existing_manifest: existingManifest ?? undefined,
          conversation_context: conversationContext,
        }),
      });

      if (res.ok) {
        const payload = (await res.json()) as Record<string, unknown>;
        const candidate = payload.manifest ?? payload;
        const parsed = parseManifestPayload(candidate);
        if (parsed) {
          return recordAndReturn({
            ok: true,
            manifest: parsed,
            tier: "local",
            trace: payload.trace,
            patch: Array.isArray(payload.patch) ? (payload.patch as unknown[]) : undefined,
            diagnostics: payload.diagnostics,
          });
        }
      } else {
        const errorJson = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (errorJson.unsupported) {
          return recordAndReturn({
            ok: false,
            unsupported: errorJson.unsupported as { message?: string; alternative?: string },
            error:
              typeof errorJson.error === "string"
                ? errorJson.error
                : "Unsupported capability requested.",
            tier: "local",
            trace: errorJson.trace,
            patch: Array.isArray(errorJson.patch) ? (errorJson.patch as unknown[]) : undefined,
            diagnostics: errorJson.diagnostics,
          });
        }
      }
    } catch {
      // Local dev endpoint not responding, continue to next tier
    }
  }

  // ── 2. Try remote Supabase Edge Function ─────────────────────────────────────
  let remoteNetworkFailed = false;
  if (callerUser?.id?.startsWith("guest-")) {
    return recordAndReturn({
      ok: false,
      error: "Sign in with email to generate tools (offline guest)",
    });
  }

  try {
    const { data, error } = await supabase.functions.invoke("generate-app", {
      body: {
        user_prompt: userPrompt,
        existing_manifest: existingManifest ?? undefined,
        conversation_context: conversationContext,
      },
    });

    if (!error && data) {
      const responseRecord =
        typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
      if (responseRecord && responseRecord.ok === false) {
        return recordAndReturn({
          ok: false,
          error:
            typeof responseRecord.error === "string"
              ? responseRecord.error
              : "Failed to generate tool manifest.",
          unsupported: responseRecord.unsupported as
            | { message?: string; alternative?: string }
            | undefined,
          tier: "edge",
          trace: responseRecord.trace,
          patch: Array.isArray(responseRecord.patch)
            ? (responseRecord.patch as unknown[])
            : undefined,
          diagnostics: responseRecord.diagnostics,
        });
      }
      const candidatePayload =
        responseRecord && "manifest" in responseRecord ? responseRecord.manifest : data;
      const parsed = parseManifestPayload(candidatePayload);
      if (parsed) {
        return recordAndReturn({
          ok: true,
          manifest: parsed,
          tier: "edge",
          trace: responseRecord?.trace,
          patch: Array.isArray(responseRecord?.patch)
            ? (responseRecord.patch as unknown[])
            : undefined,
          diagnostics: responseRecord?.diagnostics,
        });
      }
    }

    if (error) {
      const { message, body } = await readInvokeError(error);
      if (body?.unsupported) {
        return recordAndReturn({
          ok: false,
          unsupported: body.unsupported as { message?: string; alternative?: string },
          error: message,
          tier: "edge",
          trace: body.trace,
          patch: Array.isArray(body.patch) ? (body.patch as unknown[]) : undefined,
          diagnostics: body.diagnostics,
        });
      }

      let errorText = message;
      const diagValErrors = (body?.diagnostics as Record<string, unknown> | undefined)?.validationErrors;
      if (Array.isArray(diagValErrors) && diagValErrors.length > 0) {
        const top3 = (diagValErrors as string[]).slice(0, 3).join("; ");
        errorText = `${errorText} (${top3})`;
      }

      const isNetworkFailure =
        errorText.includes("Failed to send a request") ||
        errorText.includes("FetchError") ||
        errorText.includes("NetworkError") ||
        errorText.includes("Failed to fetch") ||
        errorText.includes("offline") ||
        errorText.includes("not reachable");

      if (isNetworkFailure || (!body && import.meta.env.DEV)) {
        remoteNetworkFailed = true;
      } else {
        return recordAndReturn({
          ok: false,
          error: errorText,
          tier: "edge",
          trace: body?.trace,
          patch: Array.isArray(body?.patch) ? (body?.patch as unknown[]) : undefined,
          diagnostics: body?.diagnostics,
        });
      }
    }
  } catch {
    remoteNetworkFailed = true;
  }

  // ── 3. Direct Groq In-Browser Generation (Edit & Custom Apps) ────────────────
  const groqKey = getClientGroqKey();
  let lastGroqError: string | null = null;
  if (groqKey && import.meta.env.DEV) {
    try {
      const llmProvider = new BrowserGroqLlmProvider(groqKey);
      const orchResult = await runGenerateOrchestrator(
        {
          userPrompt,
          existingManifest: (existingManifest as unknown as ManifestV2Like) ?? undefined,
          conversationContext: (conversationContext as unknown as ConversationTurn[]) ?? [],
        },
        {
          llmProvider,
          validateManifest: validateWithAppZodSchema,
        }
      );

      if (orchResult.ok && orchResult.manifest) {
        return recordAndReturn({
          ok: true,
          manifest: orchResult.manifest as unknown as ManifestV2,
          patch: orchResult.patch,
          trace: orchResult.trace,
          diagnostics: orchResult.diagnostics,
          tier: "browser",
        });
      }

      if (orchResult.unsupported) {
        return recordAndReturn({
          ok: false,
          unsupported: orchResult.unsupported,
          error: orchResult.error ?? "Unsupported capability requested.",
          trace: orchResult.trace,
          diagnostics: orchResult.diagnostics,
          tier: "browser",
        });
      }

      lastGroqError = orchResult.error ?? "Browser orchestrator failed";
    } catch (err) {
      console.warn("Direct Groq in-browser generation failed:", err);
      lastGroqError = err instanceof Error ? err.message : String(err);
    }
  }

  // ── 4. Deterministic In-Browser Starter Template Fallback ───────────────────
  if (!existingManifest) {
    try {
      const matcher = new KeywordTemplateMatcher(0.2);
      const match = await matcher.findBestMatch(userPrompt);

      if (match && match.manifest) {
        const cloned = structuredClone(match.manifest) as ManifestV2Like;
        cloned.app_id = `app-${Date.now()}`;
        const parsed = parseManifestPayload(cloned);
        if (parsed) {
          return recordAndReturn({ ok: true, manifest: parsed, tier: "template" });
        }
      }
    } catch (err) {
      console.warn("Client template fallback failed:", err);
    }
  }

  // ── 5. Diagnostic Error Notice ──────────────────────────────────────────────
  if (lastGroqError) {
    return recordAndReturn({
      ok: false,
      error: `LLM generation error: ${lastGroqError}`,
      tier: "browser",
    });
  }

  if (remoteNetworkFailed && !groqKey) {
    return recordAndReturn({
      ok: false,
      error:
        "The Supabase Edge Function is not reachable (check VITE_SUPABASE_URL in .env). To build apps locally, run 'npm run dev:mcp' or enter a Groq API key in the /plan screen.",
      tier: "edge",
    });
  }

  return recordAndReturn({
    ok: false,
    error: "Failed to generate tool manifest. Please try rephrasing or check your prompt.",
  });
}
