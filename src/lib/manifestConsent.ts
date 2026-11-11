import type { Manifest } from "@/schema/manifest.v1";
import type { ManifestV2 } from "@/schema/manifest.v2";
import { isHighRiskMcpTool } from "../../supabase/functions/_shared/mcpSecurity.ts";

export interface ConnectorConsentEntry {
  connectorId: string;
  tools: string[];
  highRiskTools: string[];
}

export interface ManifestConsentSummary {
  permissions: string[];
  connectors: ConnectorConsentEntry[];
  apis: string[];
  hasHighRiskTools: boolean;
  requiresConsent: boolean;
}

/** Extracts device permissions, MCP connectors/tools, and external APIs requiring user consent before saving. */
export function getManifestConsentSummary(manifest: Manifest | ManifestV2): ManifestConsentSummary {
  const permissions = Array.from(new Set(manifest.permissions ?? []));

  const connectorToolMap = new Map<string, Set<string>>();
  if ("connectors" in manifest && Array.isArray(manifest.connectors)) {
    for (const connector of manifest.connectors) {
      const id = connector.connector_id.trim();
      if (!id) continue;
      const toolSet = connectorToolMap.get(id) ?? new Set<string>();
      for (const tool of connector.tools ?? []) {
        const trimmedTool = tool.trim();
        if (trimmedTool) toolSet.add(trimmedTool);
      }
      connectorToolMap.set(id, toolSet);
    }
  }

  const apis = new Set<string>();
  for (const action of manifest.actions ?? []) {
    if (action.kind === "api_fetch" && action.api) {
      apis.add(action.api);
    }
    if (action.kind === "mcp_call") {
      const connectorId = "connector_id" in action && typeof action.connector_id === "string"
        ? action.connector_id.trim()
        : "";
      const toolName = "tool_name" in action && typeof action.tool_name === "string"
        ? action.tool_name.trim()
        : "";
      if (connectorId) {
        const toolSet = connectorToolMap.get(connectorId) ?? new Set<string>();
        if (toolName) toolSet.add(toolName);
        connectorToolMap.set(connectorId, toolSet);
      }
    }
  }

  const connectors: ConnectorConsentEntry[] = Array.from(connectorToolMap.entries()).map(
    ([connectorId, toolSet]) => {
      const tools = Array.from(toolSet);
      const highRiskTools = tools.filter((tool) => isHighRiskMcpTool(tool));
      return { connectorId, tools, highRiskTools };
    },
  );

  const hasHighRiskTools = connectors.some((entry) => entry.highRiskTools.length > 0);
  const apiList = Array.from(apis);
  const requiresConsent = permissions.length > 0 || connectors.length > 0 || apiList.length > 0;

  return {
    permissions,
    connectors,
    apis: apiList,
    hasHighRiskTools,
    requiresConsent,
  };
}
