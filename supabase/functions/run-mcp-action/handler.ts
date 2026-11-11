import { Client, StreamableHTTPClientTransport } from "npm:@modelcontextprotocol/client@2.4.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createSsrfSafeFetch,
  SsrfError,
  validateOutboundMcpUrl,
  type SsrfValidationOptions,
} from "../_shared/ssrf.ts";

const MAX_TOOL_OUTPUT_BYTES = 64 * 1024;

export interface RunMcpRequestPayload {
  action?: {
    id?: string;
    kind?: string;
    connector_id?: string;
    tool_name?: string;
    params?: Record<string, unknown>;
  };
  app_data?: Record<string, unknown>;
}

export interface ConnectorConfig {
  url: string;
  bearerToken?: string;
}

export interface RunMcpDeps {
  getEnv?: (key: string) => string | undefined;
  verifyJwt?: (authHeader: string) => Promise<{ userId: string } | null>;
  resolveConnector?: (connectorId: string) => ConnectorConfig | null;
  ssrfOptions?: SsrfValidationOptions;
  baseFetch?: typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function interpolateParams(
  rawParams: Record<string, unknown> | undefined,
  appData: Record<string, unknown>
): Record<string, unknown> {
  if (!rawParams) return {};
  const resolved: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(rawParams)) {
    if (typeof v === "string") {
      const exactMatch = /^\{\{([a-zA-Z0-9_.-]+)\}\}$/.exec(v.trim());
      if (exactMatch && exactMatch[1] in appData) {
        resolved[k] = appData[exactMatch[1]];
        continue;
      }
      resolved[k] = v.replace(/\{\{([a-zA-Z0-9_.-]+)\}\}/g, (_m, key: string) => {
        if (!(key in appData)) return "";
        const val = appData[key];
        return typeof val === "string" ? val : JSON.stringify(val);
      });
    } else {
      resolved[k] = v;
    }
  }

  return resolved;
}

function formatUntrustedToolOutput(
  content: unknown,
  isError: boolean
): { result: string; rawContent: unknown } {
  const items = Array.isArray(content) ? content : [];
  const parts: string[] = [];

  for (const item of items) {
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string") {
        parts.push(record.text);
        continue;
      }
    }
    parts.push(JSON.stringify(item));
  }

  let joined = parts.join("\n").trim();
  if (!joined) {
    joined = isError ? "MCP tool returned an error" : "OK";
  }

  const encoder = new TextEncoder();
  if (encoder.encode(joined).length > MAX_TOOL_OUTPUT_BYTES) {
    joined = `${joined.slice(0, 8192)}... [truncated]`;
  }

  // Try extracting a friendly summary if text contains JSON with summary/state
  let display = joined;
  try {
    const parsed = JSON.parse(joined) as Record<string, unknown>;
    if (typeof parsed.summary === "string") {
      display = parsed.summary;
    } else if (typeof parsed.state === "string" && typeof parsed.entity_id === "string") {
      display = `${parsed.entity_id} is ${parsed.state}`;
    }
  } catch {
    // Plain text tool response — keep sanitized text as-is
  }

  return { result: display, rawContent: items };
}

function defaultResolveConnector(
  connectorId: string,
  getEnv: (k: string) => string | undefined
): ConnectorConfig | null {
  const mapRaw = getEnv("MCP_CONNECTOR_URLS");
  if (mapRaw) {
    try {
      const parsed = JSON.parse(mapRaw) as Record<string, string | { url: string; token?: string }>;
      const entry = parsed[connectorId];
      if (typeof entry === "string") {
        return { url: entry };
      }
      if (entry && typeof entry.url === "string") {
        return { url: entry.url, bearerToken: entry.token };
      }
    } catch {
      // Ignore malformed env map and fall back to explicit Phase 1b fake connector env
    }
  }

  if (connectorId === "fake_home_assistant") {
    const url = getEnv("FAKE_MCP_SERVER_URL");
    if (url) return { url };
  }

  return null;
}

async function defaultVerifyAuth(
  authHeader: string,
  getEnv: (k: string) => string | undefined,
  allowLocalDevLoopback: boolean
): Promise<{ userId: string } | null> {
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;

  const localDevToken = getEnv("MCP_LOCAL_DEV_TOKEN");
  if (allowLocalDevLoopback && localDevToken && token === localDevToken) {
    return { userId: "local-dev-user" };
  }

  const supabaseUrl = getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY") ?? getEnv("VITE_SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  try {
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
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
    return data.id ? { userId: data.id } : null;
  } catch {
    return null;
  }
}

export async function handleRunMcpAction(req: Request, deps: RunMcpDeps = {}): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const getEnv = deps.getEnv ?? ((k: string) => Deno.env.get(k));
  const allowLocalDevLoopback = getEnv("MCP_ALLOW_LOCAL_DEV_LOOPBACK") === "true";

  const authHeader = req.headers.get("authorization") ?? "";
  const user = deps.verifyJwt
    ? await deps.verifyJwt(authHeader)
    : await defaultVerifyAuth(authHeader, getEnv, allowLocalDevLoopback);

  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: RunMcpRequestPayload;
  try {
    body = (await req.json()) as RunMcpRequestPayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const action = body.action;
  if (!action || action.kind !== "mcp_call") {
    return jsonResponse({ error: "action with kind 'mcp_call' is required" }, 400);
  }

  const connectorId = typeof action.connector_id === "string" ? action.connector_id.trim() : "";
  const toolName = typeof action.tool_name === "string" ? action.tool_name.trim() : "";
  if (!connectorId || !toolName) {
    return jsonResponse({ error: "action.connector_id and action.tool_name are required" }, 400);
  }

  const connector = deps.resolveConnector
    ? deps.resolveConnector(connectorId)
    : defaultResolveConnector(connectorId, getEnv);

  if (!connector) {
    return jsonResponse({ error: `Unknown or unconfigured connector: ${connectorId}` }, 404);
  }

  const ssrfOptions: SsrfValidationOptions = {
    ...deps.ssrfOptions,
    allowLocalDevLoopback,
  };

  let endpointUrl: URL;
  try {
    endpointUrl = await validateOutboundMcpUrl(connector.url, ssrfOptions);
  } catch (err) {
    const message = err instanceof SsrfError ? err.message : "Blocked MCP endpoint URL";
    return jsonResponse({ error: message }, 403);
  }

  const safeFetch = createSsrfSafeFetch({
    ...ssrfOptions,
    timeoutMs: 15_000,
    baseFetch: deps.baseFetch,
  });

  const headers: Record<string, string> = {};
  if (connector.bearerToken) {
    headers["Authorization"] = `Bearer ${connector.bearerToken}`;
  }

  const client = new Client({
    name: "simple-run-mcp-action",
    version: "1.0.0",
  });

  const transport = new StreamableHTTPClientTransport(endpointUrl, {
    fetch: safeFetch,
    requestInit: Object.keys(headers).length > 0 ? { headers } : undefined,
  });

  try {
    await client.connect(transport);
    const toolArgs = interpolateParams(action.params, body.app_data ?? {});
    const toolResult = await client.callTool({
      name: toolName,
      arguments: toolArgs,
    });

    const isError = Boolean((toolResult as { isError?: boolean }).isError);
    const formatted = formatUntrustedToolOutput(
      (toolResult as { content?: unknown }).content,
      isError
    );

    if (isError) {
      return jsonResponse({ error: formatted.result, raw: formatted.rawContent }, 502);
    }

    return jsonResponse({
      result: formatted.result,
      raw: {
        connector_id: connectorId,
        tool_name: toolName,
        content: formatted.rawContent,
      },
    });
  } catch (err) {
    if (err instanceof SsrfError) {
      return jsonResponse({ error: err.message }, 403);
    }
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 502);
  } finally {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}

