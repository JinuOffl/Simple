import type { ManifestV2Action } from "@/schema/manifest.v2";
import { supabase } from "@/lib/supabaseClient";
import { useAppStore } from "@/lib/zustandStore";

export interface ExecuteMcpCallParams {
  action: ManifestV2Action;
  appData: Record<string, unknown>;
  onDataChange?: (key: string, value: unknown) => void;
  isPreview?: boolean;
}

interface McpActionResponsePayload {
  result?: string;
  error?: string;
  raw?: unknown;
}

async function invokeMcpEndpoint(
  action: ManifestV2Action,
  appData: Record<string, unknown>
): Promise<McpActionResponsePayload> {
  const localUrl = import.meta.env.VITE_LOCAL_MCP_ACTION_URL;
  if (import.meta.env.DEV && typeof localUrl === "string" && localUrl.trim().length > 0) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const bearer = session?.access_token ?? "local-dev-preview";

    const res = await fetch(localUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ action, app_data: appData }),
    });

    const payload = (await res.json().catch(() => ({}))) as McpActionResponsePayload;
    if (!res.ok) {
      throw new Error(payload.error ?? `Local run-mcp-action failed (${res.status})`);
    }
    return payload;
  }

  const { data, error } = await supabase.functions.invoke<McpActionResponsePayload>(
    "run-mcp-action",
    {
      body: { action, app_data: appData },
    }
  );
  if (error) {
    throw new Error(error.message || "Failed to execute MCP action");
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  return data ?? {};
}

export async function executeMcpCallAction({
  action,
  appData,
  onDataChange,
  isPreview,
}: ExecuteMcpCallParams): Promise<void> {
  const targetNodeId = action.render_result_into;
  const outputKey = action.output_key ?? targetNodeId;

  if (isPreview) {
    const label = [action.connector_id, action.tool_name].filter(Boolean).join(".");
    if (outputKey) {
      onDataChange?.(outputKey, `[Preview] Would run MCP tool ${label || action.id}.`);
    }
    return;
  }

  if (!action.connector_id || !action.tool_name) {
    if (outputKey) {
      onDataChange?.(outputKey, "Error: MCP action is missing connector_id or tool_name.");
    }
    return;
  }

  const setLoading = useAppStore.getState().setComponentLoading;
  if (targetNodeId) {
    setLoading(targetNodeId, true);
  }

  try {
    const payload = await invokeMcpEndpoint(action, appData);
    const resultText = payload.result ?? "Done.";
    if (outputKey) {
      onDataChange?.(outputKey, resultText);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Simple] mcp_call error:", err);
    if (outputKey) {
      onDataChange?.(outputKey, `Error: ${message}`);
    }
  } finally {
    if (targetNodeId) {
      setLoading(targetNodeId, false);
    }
  }
}

