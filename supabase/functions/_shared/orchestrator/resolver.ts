import type { PromptAnalysis, ResolvedPlan, TemplateMatch } from "./types.ts";
import { REGISTRY_BY_TYPE } from "./registrySpec.ts";

/**
 * Deterministic `RESOLVE` stage:
 * Maps extracted intent + matched template onto verified built-in components,
 * allowlisted APIs, MCP connectors, and strict minimal permissions.
 * Refuses unsupported requests honestly before calling the generation LLM.
 */
export function resolveCapabilities(
  analysis: PromptAnalysis,
  templateMatch: TemplateMatch | null
): ResolvedPlan {
  if (analysis.unsupportedRequests.length > 0) {
    const primary = analysis.unsupportedRequests[0]!;
    return {
      supported: false,
      honestyMessage: primary.reason,
      closestAlternative: primary.alternative,
      components: [],
      permissions: [],
      connectors: [],
      apis: [],
      requiresRuntimeLlm: false,
      notes: [`Refused unsupported capability: ${primary.feature}`],
    };
  }

  const componentSet = new Set<string>(analysis.suggestedComponents);
  if (templateMatch) {
    for (const screen of templateMatch.manifest.screens) {
      for (const node of screen.nodes) {
        componentSet.add(node.type);
      }
    }
  }

  // Always derive required permissions from the resolved registry entries
  const permissionSet = new Set(analysis.suggestedPermissions);
  for (const comp of componentSet) {
    const entry = REGISTRY_BY_TYPE.get(comp);
    if (entry) {
      for (const perm of entry.requiredPermissions) {
        permissionSet.add(perm);
      }
    }
  }

  const connectorsMap = new Map<string, Set<string>>();
  for (const c of analysis.suggestedConnectors) {
    const existing = connectorsMap.get(c.connectorId);
    if (existing) {
      c.tools.forEach((t) => existing.add(t));
    } else {
      connectorsMap.set(c.connectorId, new Set(c.tools));
    }
  }
  if (templateMatch && analysis.suggestedConnectors.length > 0) {
    for (const c of templateMatch.manifest.connectors) {
      const existing = connectorsMap.get(c.connector_id);
      if (existing) {
        c.tools.forEach((t) => existing.add(t));
      } else {
        connectorsMap.set(c.connector_id, new Set(c.tools));
      }
    }
  }

  const connectors = [...connectorsMap.entries()].map(([connector_id, tools]) => ({
    connector_id,
    tools: [...tools],
  }));

  const apis = [...new Set(analysis.suggestedApis)];
  const requiresRuntimeLlm =
    componentSet.has("conversation_loop") ||
    componentSet.has("chat_thread") ||
    (apis.length === 0 && connectors.length === 0 && componentSet.has("button"));

  const notes: string[] = [];
  if (templateMatch) {
    notes.push(`Matched starter template "${templateMatch.slug}" (score ${templateMatch.score})`);
  }
  if (analysis.multiplayerRequested) {
    notes.push("Multiplayer requested: enable manifest.multiplayer with default_role");
  }

  return {
    supported: true,
    templateSlug: templateMatch?.slug,
    components: [...componentSet],
    permissions: [...permissionSet],
    connectors,
    apis,
    requiresRuntimeLlm,
    notes,
    toolRequirements: [],
  };
}

