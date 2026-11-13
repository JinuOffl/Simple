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

function findNodeInManifest(manifest: Record<string, unknown> | null, nodeId: string): Record<string, unknown> | null {
  if (!manifest || !Array.isArray(manifest.screens)) return null;
  for (const sc of manifest.screens) {
    if (sc && Array.isArray((sc as Record<string, unknown>).nodes)) {
      for (const n of (sc as Record<string, unknown>).nodes as Array<Record<string, unknown>>) {
        if (n && n.id === nodeId) return n;
      }
    }
  }
  return null;
}

function sanitizeAndRepairManifest(raw: unknown, fallbackExisting?: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const obj = structuredClone(raw) as Record<string, unknown>;
  const fallback =
    fallbackExisting && typeof fallbackExisting === "object"
      ? (fallbackExisting as Record<string, unknown>)
      : null;

  // 1. Core manifest fields
  if (obj.schema_version !== 2 && obj.schema_version !== 1) {
    obj.schema_version = 2;
  }
  if (!obj.app_id || typeof obj.app_id !== "string") {
    obj.app_id = (fallback?.app_id as string) || `app-${Date.now()}`;
  }
  if (!obj.name || typeof obj.name !== "string") {
    obj.name = (fallback?.name as string) || "Simple App";
  }
  if (!obj.icon || typeof obj.icon !== "string") {
    obj.icon = (fallback?.icon as string) || "📱";
  }
  if (!Array.isArray(obj.permissions)) {
    obj.permissions = Array.isArray(fallback?.permissions) ? fallback.permissions : [];
  }
  if (!Array.isArray(obj.connectors)) {
    obj.connectors = Array.isArray(fallback?.connectors) ? fallback.connectors : [];
  }

  // 2. data.collections
  if (!obj.data || typeof obj.data !== "object") {
    obj.data = { collections: [] };
  } else {
    const dataObj = obj.data as Record<string, unknown>;
    if (!Array.isArray(dataObj.collections)) {
      dataObj.collections = [];
    } else {
      const allowedFieldTypes = new Set(["string", "number", "boolean", "date", "json", "image_ref"]);
      dataObj.collections = dataObj.collections.map((col, cIdx) => {
        if (!col || typeof col !== "object") return { name: `col_${cIdx}`, shared: false, fields: [] };
        const c = { ...(col as Record<string, unknown>) };
        if (!c.name || typeof c.name !== "string") {
          c.name = typeof c.id === "string" ? c.id : `collection_${cIdx}`;
        }
        delete c.id;
        c.shared = Boolean(c.shared);
        if (!Array.isArray(c.fields)) {
          c.fields = [];
        } else {
          c.fields = (c.fields as Array<Record<string, unknown>>).map((f, fIdx) => {
            if (!f || typeof f !== "object") return { name: `field_${fIdx}`, type: "string" };
            const field = { ...f };
            const name = typeof field.name === "string" ? field.name : typeof field.id === "string" ? field.id : `field_${fIdx}`;
            let type = typeof field.type === "string" ? field.type.toLowerCase() : "string";
            if (type === "text" || !allowedFieldTypes.has(type)) {
              type = "string";
            }
            return { name, type };
          });
        }
        return c;
      });
    }
  }

  // 3. actions
  const allowedKinds = new Set([
    "llm_call",
    "local_compute",
    "api_fetch",
    "mcp_call",
    "navigate",
    "save_data",
    "record_insert",
    "record_update",
    "conversation_loop",
    "sandbox_fn",
  ]);

  if (!Array.isArray(obj.actions)) {
    obj.actions = [];
  } else {
    obj.actions = (obj.actions as Array<Record<string, unknown>>)
      .map((action, aIdx) => {
        if (!action || typeof action !== "object") return null;
        const a = { ...action };
        const id = typeof a.id === "string" ? a.id : `act_${aIdx}`;
        let kind = typeof a.kind === "string" ? a.kind : "";

        // Normalize non-standard LLM action types to valid ActionKindSchema
        if (!kind && typeof a.type === "string") {
          const t = a.type.toLowerCase();
          if (t === "create" || t === "insert") kind = "record_insert";
          else if (t === "update" || t === "edit") kind = "record_update";
          else if (t === "navigate" || t === "goto") kind = "navigate";
          else if (t === "save") kind = "save_data";
          else kind = "local_compute";
        }

        if (!allowedKinds.has(kind)) {
          kind = "local_compute";
        }

        // Clean up invalid extra fields that fail strict action schema
        delete a.type;
        delete a.label;

        const cleanAction: Record<string, unknown> = { id, kind };
        if (typeof a.prompt_template === "string") cleanAction.prompt_template = a.prompt_template;
        if (typeof a.persona_prompt === "string") cleanAction.persona_prompt = a.persona_prompt;
        if (typeof a.operation === "string") cleanAction.operation = a.operation;
        if (typeof a.api === "string") cleanAction.api = a.api;
        if (typeof a.connector_id === "string") cleanAction.connector_id = a.connector_id;
        if (typeof a.tool_name === "string") cleanAction.tool_name = a.tool_name;
        if (typeof a.collection === "string") cleanAction.collection = a.collection;
        if (a.params && typeof a.params === "object") cleanAction.params = a.params;
        if (Array.isArray(a.input_from)) cleanAction.input_from = a.input_from;
        if (typeof a.render_result_into === "string") cleanAction.render_result_into = a.render_result_into;
        if (typeof a.output_key === "string") cleanAction.output_key = a.output_key;

        return cleanAction;
      })
      .filter(Boolean);
  }

  // 4. screens and nodes
  if (!Array.isArray(obj.screens) || obj.screens.length === 0) {
    if (fallback && Array.isArray(fallback.screens)) {
      obj.screens = fallback.screens;
    } else {
      obj.screens = [
        {
          id: "main",
          title: (obj.name as string) || "Main",
          nodes: [],
        },
      ];
    }
  } else {
    const screensList = obj.screens as Array<Record<string, unknown>>;
    obj.screens = screensList.map((sc, sIdx) => {
      const s = { ...sc };
      s.id = typeof s.id === "string" ? s.id : `screen_${sIdx}`;
      s.title = typeof s.title === "string" ? s.title : "Screen";
      if (!Array.isArray(s.nodes)) s.nodes = [];

      s.nodes = (s.nodes as Array<Record<string, unknown>>).map((node, nIdx) => {
        if (!node || typeof node !== "object") {
          return { id: `node_${nIdx}`, type: "text", props: { content: "" } };
        }
        const n = { ...node };
        n.id = typeof n.id === "string" ? n.id : `node_${nIdx}`;
        n.type = typeof n.type === "string" ? n.type : "text";

        // Specific repair for checklist
        if (n.type === "checklist") {
          const props = n.props && typeof n.props === "object" ? { ...(n.props as Record<string, unknown>) } : {};
          if (!Array.isArray(props.items)) {
            // Check if existing manifest had items for this node
            const fallbackNode = findNodeInManifest(fallback, String(n.id));
            if (fallbackNode?.props && Array.isArray((fallbackNode.props as Record<string, unknown>).items)) {
              props.items = (fallbackNode.props as Record<string, unknown>).items;
            } else {
              props.items = [];
            }
          }
          // Remove illegal props like collection or fields
          delete props.collection;
          delete props.fields;
          n.props = props;
        }

        // Specific repair for button
        if (n.type === "button") {
          const props = n.props && typeof n.props === "object" ? { ...(n.props as Record<string, unknown>) } : {};
          if (typeof props.label !== "string") {
            props.label = "Action";
          }
          n.props = props;
        }

        // Specific repair for card
        if (n.type === "card") {
          const props = n.props && typeof n.props === "object" ? { ...(n.props as Record<string, unknown>) } : {};
          if (typeof props.title !== "string") props.title = "";
          if (typeof props.body !== "string") props.body = "";
          n.props = props;
        }

        return n;
      });

      return s;
    });
  }

  return obj;
}

function parseManifestPayload(payload: unknown, fallbackExisting?: unknown): Manifest | ManifestV2 | null {
  if (!payload || typeof payload !== "object") return null;

  const v2Parse = ManifestV2Schema.safeParse(payload);
  if (v2Parse.success) return v2Parse.data;

  const v1Parse = ManifestSchema.safeParse(payload);
  if (v1Parse.success) return v1Parse.data;

  // Attempt automatic schema repair for LLM deviations
  const repaired = sanitizeAndRepairManifest(payload, fallbackExisting);
  if (repaired) {
    const repairedV2 = ManifestV2Schema.safeParse(repaired);
    if (repairedV2.success) return repairedV2.data;

    const repairedV1 = ManifestSchema.safeParse(repaired);
    if (repairedV1.success) return repairedV1.data;
  }

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
  const candidateModels = [
    "qwen/qwen3.8-27b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "openai/gpt-oss-120b",
  ];

  let lastError: Error | null = null;

  for (const model of candidateModels) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        // Model decommissioned, not found, or rate limit on that model -> try next candidate
        if (res.status === 404 || res.status === 400 || res.status === 422) {
          lastError = new Error(`Groq model ${model} unavailable (${res.status}): ${text}`);
          continue;
        }
        throw new Error(`Groq API error (${res.status}): ${text}`);
      }

      const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const rawText = json.choices?.[0]?.message?.content ?? "";
      return extractJsonFromText(rawText);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("All candidate Groq models failed.");
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
        msg.includes("Failed to fetch") ||
        msg.includes("offline") ||
        msg.includes("not reachable")
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
  let lastGroqError: string | null = null;
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
          try {
            const patched = applyJsonPatch(
              existingManifest as unknown as ManifestV2Like,
              ops
            );
            const parsed = parseManifestPayload(patched, existingManifest);
            if (parsed) {
              return { ok: true, manifest: parsed };
            }
          } catch (patchErr) {
            console.warn("applyJsonPatch failed, attempting direct payload parse:", patchErr);
          }
        }

        // If the model emitted a complete replacement manifest instead of RFC 6902 patch
        const directParsed = parseManifestPayload(patchData, existingManifest);
        if (directParsed) {
          return { ok: true, manifest: directParsed };
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
          return { ok: true, manifest: parsed };
        }
      }
    } catch (err) {
      console.warn("Client template fallback failed:", err);
    }
  }

  // ── 5. Diagnostic Error Notice ──────────────────────────────────────────────
  if (lastGroqError) {
    return {
      ok: false,
      error: `LLM generation error: ${lastGroqError}`,
    };
  }

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
