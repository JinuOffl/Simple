import { supabase } from "./supabaseClient";
import type { Manifest } from "@/schema/manifest.v1";
import type { ManifestV2 } from "@/schema/manifest.v2";
import { ManifestSchema } from "@/schema/manifest.v1";
import { ManifestV2Schema } from "@/schema/manifest.v2";
import { KeywordTemplateMatcher } from "../../supabase/functions/_shared/orchestrator/templates.ts";
import type { ManifestV2Like } from "../../supabase/functions/_shared/orchestrator/types.ts";

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
}

function parseManifestPayload(payload: unknown): Manifest | ManifestV2 | null {
  const v2Parse = ManifestV2Schema.safeParse(payload);
  if (v2Parse.success) return v2Parse.data;

  const v1Parse = ManifestSchema.safeParse(payload);
  if (v1Parse.success) return v1Parse.data;

  return null;
}

/**
 * Invoke app generation with a resilient fallback chain:
 * 1. Local Deno dev server (/local-functions/generate-app) if running
 * 2. Supabase Edge Function (generate-app)
 * 3. In-browser deterministic template matcher / offline fallback
 */
export async function generateAppWithFallback(
  params: GenerateAppParams
): Promise<GenerationClientResult> {
  const { userPrompt, existingManifest, conversationContext } = params;

  const localEndpoint =
    import.meta.env.VITE_LOCAL_GENERATE_APP_URL ??
    (import.meta.env.DEV ? "/local-functions/generate-app" : undefined);

  // ── 1. Try local dev server endpoint first (npm run dev:mcp) ──────────────────
  if (localEndpoint) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const bearer = session?.access_token ?? "local-dev-user";

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
          return { ok: true, manifest: parsed };
        }
      } else {
        const errorJson = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (errorJson.unsupported) {
          return {
            ok: false,
            unsupported: errorJson.unsupported as { message?: string; alternative?: string },
            error: typeof errorJson.error === "string" ? errorJson.error : "Unsupported capability requested.",
          };
        }
      }
    } catch {
      // Local dev endpoint not responding, continue to remote Supabase
    }
  }

  // ── 2. Try remote Supabase Edge Function ─────────────────────────────────────
  let remoteNetworkFailed = false;
  try {
    const { data, error } = await supabase.functions.invoke("generate-app", {
      body: {
        user_prompt: userPrompt,
        existing_manifest: existingManifest ?? undefined,
        conversation_context: conversationContext,
      },
    });

    if (!error && data) {
      const responseRecord = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
      if (responseRecord && responseRecord.ok === false) {
        return {
          ok: false,
          error: typeof responseRecord.error === "string" ? responseRecord.error : "Failed to generate app manifest.",
          unsupported: responseRecord.unsupported as { message?: string; alternative?: string } | undefined,
        };
      }
      const candidatePayload = responseRecord && "manifest" in responseRecord ? responseRecord.manifest : data;
      const parsed = parseManifestPayload(candidatePayload);
      if (parsed) {
        return { ok: true, manifest: parsed };
      }
    }

    if (error) {
      const msg = error.message ?? String(error);
      if (
        msg.includes("Failed to send a request") ||
        msg.includes("FetchError") ||
        msg.includes("NetworkError") ||
        msg.includes("Failed to fetch")
      ) {
        remoteNetworkFailed = true;
      } else {
        return { ok: false, error: msg };
      }
    }
  } catch {
    remoteNetworkFailed = true;
  }

  // ── 3. Deterministic In-Browser Fallback ───────────────────────────────────────
  // If remote Supabase was unreachable / unconfigured, attempt local template match:
  try {
    const matcher = new KeywordTemplateMatcher(0.2);
    const match = await matcher.findBestMatch(userPrompt);

    if (match && match.manifest) {
      const cloned = structuredClone(match.manifest) as ManifestV2Like;
      cloned.app_id = `app-${Date.now()}`;
      // Adapt title if user had a specific request (e.g. Clock / World Clock)
      if (match.slug === "world-clock" && /indian|us|time/i.test(userPrompt)) {
        cloned.name = "World Clock (US / IST)";
        cloned.description = "Live dual time display for US and Indian time zones.";
      }
      const parsed = parseManifestPayload(cloned);
      if (parsed) {
        return { ok: true, manifest: parsed };
      }
    }
  } catch (err) {
    console.warn("Client template fallback failed:", err);
  }

  // ── 4. Helpful Diagnostic Message ──────────────────────────────────────────
  if (remoteNetworkFailed) {
    return {
      ok: false,
      error:
        "The Supabase Edge Function is not reachable (check VITE_SUPABASE_URL in .env). To build apps locally without remote Supabase deployment, start the local MCP dev server: 'npm run dev:mcp'.",
    };
  }

  return {
    ok: false,
    error: "Failed to generate app manifest. Please try rephrasing or check your connection.",
  };
}
