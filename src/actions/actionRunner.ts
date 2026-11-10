import { supabase } from "@/lib/supabaseClient";
import type { ManifestAction } from "@/schema/manifest.schema";
import { useAppStore } from "@/lib/zustandStore";

interface RunActionParams {
  action: ManifestAction;
  appData: Record<string, unknown>;
  appId?: string;
  onDataChange?: (key: string, value: unknown) => void;
  isPreview?: boolean;
}

/**
 * Runtime action executor.
 * Called when a user interacts with a rendered mini-app (not during generation).
 * Completely separate from the generate-manifest pipeline.
 */
export async function runAction({
  action,
  appData,
  appId,
  onDataChange,
  isPreview = false,
}: RunActionParams): Promise<void> {
  const store = useAppStore.getState();

  switch (action.kind) {

    // ─── LLM CALL ───────────────────────────────────────────────────────────────
    case "llm_call": {
      if (!action.render_result_into) return;
      store.setComponentLoading(action.render_result_into, true);

      try {
        // Fill {{placeholder}} template with appData values
        let prompt = action.prompt_template ?? "";
        for (const [key, val] of Object.entries(appData)) {
          prompt = prompt.replace(
            new RegExp(`\\{\\{${key}\\}\\}`, "g"),
            typeof val === "string" ? val : JSON.stringify(val)
          );
        }

        const { data, error } = await supabase.functions.invoke("run-llm-action", {
          body: { action: { ...action, prompt_template: prompt }, app_data: appData, app_id: appId },
        });

        if (error) throw new Error(error.message);
        onDataChange?.(action.render_result_into, data.result as string);
      } catch (e) {
        console.error("llm_call failed:", e);
        onDataChange?.(action.render_result_into, "⚠️ Something went wrong. Please try again.");
      } finally {
        store.setComponentLoading(action.render_result_into, false);
      }
      break;
    }

    // ─── LOCAL COMPUTE — typed operations, no network, no LLM ──────────────────
    case "local_compute": {
      if (!action.render_result_into) break;

      const inputs = (action.input_from ?? []).map((k) => appData[k]);
      const a = Number(inputs[0] ?? 0);
      const b = Number(inputs[1] ?? 0);
      let result: string | number = "";

      switch (action.operation) {
        case "add":              result = a + b; break;
        case "subtract":         result = a - b; break;
        case "multiply":         result = a * b; break;
        case "divide":           result = b !== 0 ? a / b : "Error: ÷ 0"; break;
        case "concat":           result = inputs.filter(Boolean).join(" "); break;
        case "count":            result = inputs.filter(Boolean).length; break;
        case "get_current_time": result = new Date().toLocaleTimeString(); break;
        case "format_date":      result = new Date().toLocaleDateString(undefined, {
                                   weekday: "long", month: "long", day: "numeric"
                                 }); break;
        default:
          // Fallback: concatenate
          result = inputs.filter(Boolean).join(" ");
      }

      // Format number results cleanly (avoid 0.30000000000000004)
      if (typeof result === "number") {
        result = parseFloat(result.toPrecision(12)).toString();
      }

      onDataChange?.(action.render_result_into, result);
      break;
    }

    // ─── API FETCH — calls allowlisted real APIs via Edge Function ───────────────
    case "api_fetch": {
      if (!action.render_result_into || !action.api) break;
      store.setComponentLoading(action.render_result_into, true);

      try {
        // Inject any appData values into params (e.g. city from a text input)
        const resolvedParams: Record<string, unknown> = { ...(action.params ?? {}) };
        for (const [key, val] of Object.entries(resolvedParams)) {
          if (typeof val === "string" && val.startsWith("{{") && val.endsWith("}}")) {
            const dataKey = val.slice(2, -2).trim();
            resolvedParams[key] = appData[dataKey] ?? val;
          }
        }

        const { data, error } = await supabase.functions.invoke("run-api-fetch", {
          body: { api: action.api, params: resolvedParams },
        });

        if (error) throw new Error(error.message);

        // Result is a formatted string ready to display, or structured object for special renderers
        onDataChange?.(action.render_result_into, data.result ?? data);
      } catch (e) {
        console.error("api_fetch failed:", e);
        onDataChange?.(action.render_result_into, "⚠️ Couldn't load data. Check your connection.");
      } finally {
        store.setComponentLoading(action.render_result_into, false);
      }
      break;
    }

    // ─── NAVIGATE ───────────────────────────────────────────────────────────────
    case "navigate": {
      const target = action.prompt_template ?? "/";
      window.dispatchEvent(new CustomEvent("simple:navigate", { detail: { target } }));
      break;
    }

    // ─── SAVE DATA ──────────────────────────────────────────────────────────────
    case "save_data": {
      if (!appId || isPreview) break;

      const keysToSave = action.input_from ?? [];
      const upserts = keysToSave
        .filter((key) => appData[key] !== undefined)
        .map((key) => ({ app_id: appId, key, value: appData[key] }));

      if (upserts.length > 0) {
        const { error } = await supabase
          .from("app_data")
          .upsert(upserts, { onConflict: "app_id,key" });

        if (error) console.error("save_data failed:", error);
        else window.dispatchEvent(new CustomEvent("simple:saved"));
      }
      break;
    }

    // ─── CONVERSATION LOOP ───────────────────────────────────────────────────────
    case "conversation_loop":
      // Handled entirely inside ConversationLoop.tsx
      break;

    default:
      console.warn("Unknown action kind:", (action as ManifestAction).kind);
  }
}
