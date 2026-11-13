import { supabase } from "./supabaseClient";
import type { Manifest } from "@/schema/manifest.v1";
import type { ManifestV2 } from "@/schema/manifest.v2";
import { ManifestSchema } from "@/schema/manifest.v1";
import { ManifestV2Schema } from "@/schema/manifest.v2";
import { KeywordTemplateMatcher } from "../../supabase/functions/_shared/orchestrator/templates.ts";
import { analyzePrompt } from "../../supabase/functions/_shared/orchestrator/analyzer.ts";
import { resolveCapabilities } from "../../supabase/functions/_shared/orchestrator/resolver.ts";
import {
  buildCreateManifestPrompt,
  buildEditPatchPrompt,
} from "../../supabase/functions/_shared/orchestrator/prompts.ts";
import { applyJsonPatch } from "../../supabase/functions/_shared/orchestrator/jsonPatch.ts";
import type {
  ConversationTurn,
  JsonPatchOperation,
  ManifestV2Like,
} from "../../supabase/functions/_shared/orchestrator/types.ts";

function extractJsonFromText(rawText: string): unknown {
  let cleaned = rawText.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    const firstObj = cleaned.indexOf("{");
    const lastObj = cleaned.lastIndexOf("}");
    if (firstObj !== -1 && lastObj > firstObj) {
      return JSON.parse(cleaned.slice(firstObj, lastObj + 1));
    }
    const firstArr = cleaned.indexOf("[");
    const lastArr = cleaned.lastIndexOf("]");
    if (firstArr !== -1 && lastArr > firstArr) {
      return JSON.parse(cleaned.slice(firstArr, lastArr + 1));
    }
    throw new Error("Model output did not contain valid JSON.");
  }
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
}

function parseManifestPayload(payload: unknown): Manifest | ManifestV2 | null {
  const v2Parse = ManifestV2Schema.safeParse(payload);
  if (v2Parse.success) return v2Parse.data;

  const v1Parse = ManifestSchema.safeParse(payload);
  if (v1Parse.success) return v1Parse.data;

  return null;
}

function getClientGroqKey(): string {
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

async function callGroqDirectly(
  apiKey: string,
  system: string,
  prompt: string
): Promise<unknown> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const rawText = json.choices?.[0]?.message?.content ?? "";
  return extractJsonFromText(rawText);
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
            error:
              typeof errorJson.error === "string"
                ? errorJson.error
                : "Unsupported capability requested.",
          };
        }
      }
    } catch {
      // Local dev endpoint not responding, continue to next tier
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
      const responseRecord =
        typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
      if (responseRecord && responseRecord.ok === false) {
        return {
          ok: false,
          error:
            typeof responseRecord.error === "string"
              ? responseRecord.error
              : "Failed to generate app manifest.",
          unsupported: responseRecord.unsupported as
            | { message?: string; alternative?: string }
            | undefined,
        };
      }
      const candidatePayload =
        responseRecord && "manifest" in responseRecord ? responseRecord.manifest : data;
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

  // ── 3. Direct Groq In-Browser Generation (Edit & Custom Apps) ────────────────
  const groqKey = getClientGroqKey();
  if (groqKey) {
    try {
      if (existingManifest) {
        // Edit flow via RFC 6902 JSON patch
        const analysis = analyzePrompt(
          userPrompt,
          existingManifest as unknown as ManifestV2Like,
          (conversationContext as unknown as ConversationTurn[]) ?? []
        );
        const plan = resolveCapabilities(analysis, null);
        const payload = buildEditPatchPrompt({
          userPrompt,
          existingManifest: existingManifest as unknown as ManifestV2Like,
          analysis,
          plan,
          conversationContext: (conversationContext as unknown as ConversationTurn[]) ?? [],
        });

        const patchData = await callGroqDirectly(groqKey, payload.system, payload.prompt);
        let ops: JsonPatchOperation[] = [];
        if (Array.isArray(patchData)) {
          ops = patchData as JsonPatchOperation[];
        } else if (patchData && typeof patchData === "object" && "operations" in patchData) {
          ops = (patchData as { operations: JsonPatchOperation[] }).operations;
        }

        if (ops.length > 0) {
          const patched = applyJsonPatch(
            existingManifest as unknown as ManifestV2Like,
            ops
          );
          const parsed = parseManifestPayload(patched);
          if (parsed) {
            return { ok: true, manifest: parsed };
          }
        }
      } else {
        // Create flow
        const analysis = analyzePrompt(userPrompt, undefined, (conversationContext as unknown as ConversationTurn[]) ?? []);
        const matcher = new KeywordTemplateMatcher(0.25);
        const templateMatch = await matcher.findBestMatch(userPrompt);
        const plan = resolveCapabilities(analysis, templateMatch);

        const payload = buildCreateManifestPrompt({
          userPrompt,
          analysis,
          plan,
          templateMatch,
          conversationContext: (conversationContext as unknown as ConversationTurn[]) ?? [],
        });

        const createdData = await callGroqDirectly(groqKey, payload.system, payload.prompt);
        const parsed = parseManifestPayload(createdData);
        if (parsed) {
          return { ok: true, manifest: parsed };
        }
      }
    } catch (err) {
      console.warn("Direct Groq in-browser generation failed:", err);
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
  }

  // ── 5. Diagnostic Error Notice ──────────────────────────────────────────────
  if (remoteNetworkFailed && !groqKey) {
    return {
      ok: false,
      error:
        "The Supabase Edge Function is not reachable (check VITE_SUPABASE_URL in .env). To build apps locally, run 'npm run dev:mcp' or enter a Groq API key in the /plan screen.",
    };
  }

  return {
    ok: false,
    error: "Failed to generate app manifest. Please try rephrasing or check your prompt.",
  };
}
