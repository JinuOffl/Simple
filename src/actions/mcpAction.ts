import type { ManifestV2Action } from "@/schema/manifest.v2";
import { supabase } from "@/lib/supabaseClient";
import { useAppStore } from "@/lib/zustandStore";
import { isHighRiskMcpTool } from "../../supabase/functions/_shared/mcpSecurity.ts";

export { isHighRiskMcpTool };

export interface ExecuteMcpCallParams {
  action: ManifestV2Action;
  appData: Record<string, unknown>;
  appId?: string;
  onDataChange?: (key: string, value: unknown) => void;
  isPreview?: boolean;
  confirmed?: boolean;
  confirmHighRisk?: (toolName: string, connectorId: string) => Promise<boolean> | boolean;
}

interface McpActionResponsePayload {
  result?: string;
  error?: string;
  requires_confirmation?: boolean;
  raw?: unknown;
}

async function defaultConfirmHighRisk(toolName: string, connectorId: string): Promise<boolean> {
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    return window.confirm(
      `Confirm high-risk MCP action?\n\nConnector: ${connectorId}\nTool: ${toolName}\n\nTap OK to continue or Cancel to abort.`
    );
  }
  return false;
}

async function invokeMcpEndpoint(
  action: ManifestV2Action,
  appData: Record<string, unknown>,
  options: { appId?: string; confirmed?: boolean } = {}
): Promise<McpActionResponsePayload> {
  const requestBody: Record<string, unknown> = {
    action,
    app_data: appData,
    ...(options.appId ? { app_id: options.appId } : {}),
    ...(options.confirmed ? { confirmed: true } : {}),
  };

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
      body: JSON.stringify(requestBody),
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
      body: requestBody,
    }
  );
  if (error) {
    const context = (error as { context?: { json?: () => Promise<McpActionResponsePayload> } })
      .context;
    if (context && typeof context.json === "function") {
      try {
        const parsed = await context.json();
        if (parsed?.error) {
          throw new Error(parsed.error);
        }
      } catch (inner) {
        if (inner instanceof Error && inner.message && inner.message !== error.message) {
          throw inner;
        }
      }
    }
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
  appId,
  onDataChange,
  isPreview,
  confirmed,
  confirmHighRisk = defaultConfirmHighRisk,
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

  let isConfirmed = Boolean(confirmed);
  if (isHighRiskMcpTool(action.tool_name) && !isConfirmed) {
    const approved = await confirmHighRisk(action.tool_name, action.connector_id);
    if (!approved) {
      if (outputKey) {
        onDataChange?.(outputKey, `Cancelled high-risk action "${action.tool_name}".`);
      }
      return;
    }
    isConfirmed = true;
  }

  const setLoading = useAppStore.getState().setComponentLoading;
  if (targetNodeId) {
    setLoading(targetNodeId, true);
  }

  try {
    const payload = await invokeMcpEndpoint(action, appData, {
      appId,
      confirmed: isConfirmed,
    });
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
