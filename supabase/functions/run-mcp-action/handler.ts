import { Client, StreamableHTTPClientTransport } from "npm:@modelcontextprotocol/client@2.4.0";
import { corsHeaders } from "../_shared/cors.ts";
import { checkProductionGuard } from "../_shared/prodGuard.ts";
import { consumeCreditsRpc } from "../_shared/credits.ts";
import {
  buildStaticAuthHeaders,
  resolveUserConnectionDb,
  UUID_REGEX,
  verifyUserAppMembership,
  type AppMembershipResult,
} from "../_shared/mcpDb.ts";
import {
  isHighRiskMcpTool,
  sanitizeToolOutputText,
  validateMcpToolArgs,
} from "../_shared/mcpSecurity.ts";
import {
  createSsrfSafeFetch,
  SsrfError,
  validateOutboundMcpUrl,
  type SsrfValidationOptions,
} from "../_shared/ssrf.ts";

export interface RunMcpRequestPayload {
  app_id?: string;
  confirmed?: boolean;
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
  authHeaderName?: string;
  allowedTools?: string[];
  status?: "active" | "disabled" | "error";
}

export interface RunMcpDeps {
  getEnv?: (key: string) => string | undefined;
  verifyJwt?: (authHeader: string) => Promise<{ userId: string } | null>;
  verifyAppAccess?: (args: { appId: string; userId: string }) => Promise<AppMembershipResult>;
  resolveUserConnector?: (args: {
    connectorId: string;
    userId: string;
  }) => Promise<ConnectorConfig | null>;
  /** Phase 1b compatibility resolver (demo / single-connector override) */
  resolveConnector?: (connectorId: string) => ConnectorConfig | null;
  chargeCredits?: (args: {
    userId: string;
    appId?: string;
    connectorId: string;
    toolName: string;
  }) => Promise<{ allowed: boolean; remainingCredits?: number; monthlyCreditLimit?: number }>;
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

  joined = sanitizeToolOutputText(joined);

  let display = joined;
  try {
    const parsed = JSON.parse(joined) as Record<string, unknown>;
    if (typeof parsed.summary === "string") {
      display = sanitizeToolOutputText(parsed.summary);
    } else if (typeof parsed.state === "string" && typeof parsed.entity_id === "string") {
      display = sanitizeToolOutputText(`${parsed.entity_id} is ${parsed.state}`);
    }
  } catch {
    // Plain text tool response — keep sanitized text as-is
  }

  return { result: display, rawContent: items };
}

function defaultResolveEnvConnector(
  connectorId: string,
  getEnv: (k: string) => string | undefined
): ConnectorConfig | null {
  const mapRaw = getEnv("MCP_CONNECTOR_URLS");
  if (mapRaw) {
    try {
      const parsed = JSON.parse(mapRaw) as Record<
        string,
        string | { url: string; token?: string; allowed_tools?: string[] }
      >;
      const entry = parsed[connectorId];
      if (typeof entry === "string") {
        return { url: entry };
      }
      if (entry && typeof entry.url === "string") {
        return {
          url: entry.url,
          bearerToken: entry.token,
          ...(Array.isArray(entry.allowed_tools) ? { allowedTools: entry.allowed_tools } : {}),
        };
      }
    } catch {
      // Ignore malformed env map
    }
  }

  if (connectorId === "fake_home_assistant") {
    const url = getEnv("FAKE_MCP_SERVER_URL");
    if (url) {
      return {
        url,
        allowedTools: ["light.toggle", "light.get_state"],
      };
    }
  }

  return null;
}

async function defaultVerifyAuth(
  authHeader: string,
  getEnv: (k: string) => string | undefined,
  allowLocalDevLoopback: boolean,
  baseFetch: typeof fetch
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
    const res = await baseFetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
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

function verifyManifestMcpContract(
  manifestRaw: unknown,
  actionId: string | undefined,
  connectorId: string,
  toolName: string
): { ok: true } | { ok: false; error: string } {
  if (!manifestRaw || typeof manifestRaw !== "object") {
    return { ok: false, error: "Saved app has no valid manifest." };
  }
  const m = manifestRaw as {
    connectors?: Array<{ connector_id?: string; tools?: string[] }>;
    actions?: Array<{
      id?: string;
      kind?: string;
      connector_id?: string;
      tool_name?: string;
    }>;
  };

  // 1. Check action exists in saved manifest
  const matchingAction = (m.actions ?? []).find((a) => {
    if (a.kind !== "mcp_call") return false;
    if (actionId && a.id !== actionId) return false;
    return a.connector_id === connectorId && a.tool_name === toolName;
  });

  if (!matchingAction) {
    return {
      ok: false,
      error: `Action "${actionId ?? toolName}" (${connectorId}.${toolName}) is not declared in saved app manifest.`,
    };
  }

  // 2. Check tool is declared in manifest.connectors[].tools
  const connectorEntry = (m.connectors ?? []).find((c) => c.connector_id === connectorId);
  if (!connectorEntry || !Array.isArray(connectorEntry.tools) || !connectorEntry.tools.includes(toolName)) {
    return {
      ok: false,
      error: `Tool "${toolName}" is not declared in manifest.connectors["${connectorId}"].tools.`,
    };
  }

  return { ok: true };
}

export async function handleRunMcpAction(req: Request, deps: RunMcpDeps = {}): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const getEnv = deps.getEnv ?? ((k: string) => Deno.env.get(k));
  const misconfigured = checkProductionGuard(getEnv);
  if (misconfigured) return misconfigured;

  const baseFetch = deps.baseFetch ?? fetch;
  const allowLocalDevLoopback = getEnv("MCP_ALLOW_LOCAL_DEV_LOOPBACK") === "true";

  // ── 1. Authenticated ─────────────────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const user = deps.verifyJwt
    ? await deps.verifyJwt(authHeader)
    : await defaultVerifyAuth(authHeader, getEnv, allowLocalDevLoopback, baseFetch);

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

  const appId = typeof body.app_id === "string" && body.app_id.trim() ? body.app_id.trim() : undefined;
  const supabaseUrl = getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  // ── 2 & 3. Member with role + Action & tool in saved manifest ───────────────
  if (deps.verifyAppAccess && appId) {
    const access = await deps.verifyAppAccess({ appId, userId: user.userId });
    if (access.notFound) {
      return jsonResponse({ error: "App not found" }, 404);
    }
    if (!access.allowed) {
      return jsonResponse({ error: "Forbidden: caller is not a member of this app" }, 403);
    }
    if (access.manifest !== undefined) {
      const manifestCheck = verifyManifestMcpContract(
        access.manifest,
        action.id,
        connectorId,
        toolName
      );
      if (!manifestCheck.ok) {
        return jsonResponse({ error: manifestCheck.error }, 403);
      }
    }
  } else if (appId && UUID_REGEX.test(appId) && supabaseUrl && serviceRoleKey) {
    const access = await verifyUserAppMembership(
      supabaseUrl,
      serviceRoleKey,
      appId,
      user.userId,
      baseFetch
    );
    if (access.notFound) {
      return jsonResponse({ error: "App not found" }, 404);
    }
    if (!access.allowed) {
      return jsonResponse({ error: "Forbidden: caller is not a member of this app" }, 403);
    }
    const manifestCheck = verifyManifestMcpContract(
      access.manifest,
      action.id,
      connectorId,
      toolName
    );
    if (!manifestCheck.ok) {
      return jsonResponse({ error: manifestCheck.error }, 403);
    }
  }

  // ── 4. Invoking user's OWN connection + allowed_tools check ─────────────────
  let connector: ConnectorConfig | null = null;
  if (deps.resolveUserConnector) {
    connector = await deps.resolveUserConnector({
      connectorId,
      userId: user.userId,
    });
  } else if (deps.resolveConnector) {
    connector = deps.resolveConnector(connectorId);
  } else if (supabaseUrl && serviceRoleKey && user.userId !== "local-dev-user") {
    const dbConn = await resolveUserConnectionDb({
      supabaseUrl,
      serviceRoleKey,
      userId: user.userId,
      connectorId,
      encryptionSecret: getEnv("CONNECTION_ENCRYPTION_KEY"),
      allowEphemeralDevKey: allowLocalDevLoopback,
      fetchFn: baseFetch,
    });
    if (dbConn) {
      connector = {
        url: dbConn.server_url,
        bearerToken: dbConn.token,
        authHeaderName: dbConn.auth_header_name,
        allowedTools: dbConn.allowed_tools,
        status: dbConn.status,
      };
    }
  }

  if (!connector && (!appId || !UUID_REGEX.test(appId))) {
    connector = defaultResolveEnvConnector(connectorId, getEnv);
  }

  if (!connector) {
    return jsonResponse(
      {
        error: `No active "${connectorId}" connection found for your account. Connect it on the Connections page first.`,
      },
      404
    );
  }

  if (connector.status === "disabled" || connector.status === "error") {
    return jsonResponse(
      { error: `Connection "${connectorId}" is currently ${connector.status}.` },
      403
    );
  }

  if (Array.isArray(connector.allowedTools) && !connector.allowedTools.includes(toolName)) {
    return jsonResponse(
      {
        error: `Tool "${toolName}" is not consented in allowed_tools for your "${connectorId}" connection.`,
      },
      403
    );
  }

  // ── 5. Args validation + High-risk confirmation tap ─────────────────────────
  const interpolated = interpolateParams(action.params, body.app_data ?? {});
  const argsCheck = validateMcpToolArgs(interpolated);
  if (!argsCheck.ok) {
    return jsonResponse({ error: argsCheck.error }, 400);
  }

  if (isHighRiskMcpTool(toolName) && body.confirmed !== true) {
    return jsonResponse(
      {
        error: `Extra confirmation required before invoking high-risk tool "${toolName}".`,
        requires_confirmation: true,
        tool_name: toolName,
      },
      409
    );
  }

  // ── 6. Invoking user's credits (atomic RPC + ledger) ─────────────────────────
  if (deps.chargeCredits) {
    const creditOutcome = await deps.chargeCredits({
      userId: user.userId,
      appId,
      connectorId,
      toolName,
    });
    if (!creditOutcome.allowed) {
      return jsonResponse(
        {
          error: "Insufficient monthly credits for MCP action.",
          remaining_credits: creditOutcome.remainingCredits,
          monthly_credit_limit: creditOutcome.monthlyCreditLimit,
        },
        402
      );
    }
  } else if (supabaseUrl && serviceRoleKey && user.userId !== "local-dev-user") {
    try {
      const creditOutcome = await consumeCreditsRpc({
        supabaseUrl,
        serviceRoleKey,
        userId: user.userId,
        actionKind: "mcp_call",
        costClass: "mcp_call",
        appId: appId && UUID_REGEX.test(appId) ? appId : undefined,
        metadata: { connector_id: connectorId, tool_name: toolName },
        fetchFn: baseFetch,
      });
      if (!creditOutcome.allowed) {
        return jsonResponse(
          {
            error: "Insufficient monthly credits for MCP action.",
            remaining_credits: creditOutcome.remainingCredits,
            monthly_credit_limit: creditOutcome.monthlyCreditLimit,
          },
          402
        );
      }
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : "Failed to verify credit balance" },
        500
      );
    }
  }

  // ── 7. SSRF-safe call ────────────────────────────────────────────────────────
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

  const headers = buildStaticAuthHeaders(
    connector.authHeaderName ?? "Authorization",
    connector.bearerToken
  );

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
    const toolResult = await client.callTool({
      name: toolName,
      arguments: argsCheck.args,
    });

    // ── 8. Sanitize untrusted output ───────────────────────────────────────────
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
    return jsonResponse({ error: sanitizeToolOutputText(message) }, 502);
  } finally {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}
