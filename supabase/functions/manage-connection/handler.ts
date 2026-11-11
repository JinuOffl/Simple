import { Client, StreamableHTTPClientTransport } from "npm:@modelcontextprotocol/client@2.4.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createSsrfSafeFetch,
  SsrfError,
  validateOutboundMcpUrl,
  type SsrfValidationOptions,
} from "../_shared/ssrf.ts";
import {
  buildStaticAuthHeaders,
  deleteUserConnectionDb,
  listUserConnectionsDb,
  resolveUserConnectionDb,
  upsertUserConnectionDb,
  type DecryptedUserConnector,
  type MaskedConnectionSummary,
} from "../_shared/mcpDb.ts";
import { normalizeAuthHeaderName, sanitizeToolOutputText } from "../_shared/mcpSecurity.ts";

export interface DiscoveredToolInfo {
  name: string;
  description?: string;
}

export interface ManageConnectionPayload {
  op?: "list" | "discover_tools" | "test" | "upsert" | "delete";
  id?: string;
  connector_id?: string;
  label?: string;
  server_url?: string;
  allowed_tools?: string[];
  status?: "active" | "disabled" | "error";
  token?: string;
  auth_header_name?: string;
}

export interface ManageConnectionStore {
  list(userId: string): Promise<MaskedConnectionSummary[]>;
  resolveSecret(userId: string, connectionId: string): Promise<DecryptedUserConnector | null>;
  upsert(
    userId: string,
    input: {
      id?: string;
      connectorId: string;
      label: string;
      serverUrl: string;
      allowedTools: string[];
      status?: "active" | "disabled" | "error";
      token?: string;
      authHeaderName?: string;
    }
  ): Promise<MaskedConnectionSummary>;
  delete(userId: string, connectionId: string): Promise<boolean>;
}

export interface ManageConnectionDeps {
  getEnv?: (key: string) => string | undefined;
  verifyJwt?: (authHeader: string) => Promise<{ userId: string } | null>;
  store?: ManageConnectionStore;
  discoverTools?: (args: {
    url: URL;
    headers: Record<string, string>;
    ssrfOptions: SsrfValidationOptions;
    baseFetch?: typeof fetch;
  }) => Promise<DiscoveredToolInfo[]>;
  ssrfOptions?: SsrfValidationOptions;
  baseFetch?: typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function defaultVerifyJwt(
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
  if (!supabaseUrl || !supabaseAnonKey) return null;

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

async function defaultDiscoverTools(args: {
  url: URL;
  headers: Record<string, string>;
  ssrfOptions: SsrfValidationOptions;
  baseFetch?: typeof fetch;
}): Promise<DiscoveredToolInfo[]> {
  const safeFetch = createSsrfSafeFetch({
    ...args.ssrfOptions,
    timeoutMs: 15_000,
    baseFetch: args.baseFetch,
  });

  const client = new Client({
    name: "simple-manage-connection",
    version: "1.0.0",
  });

  const transport = new StreamableHTTPClientTransport(args.url, {
    fetch: safeFetch,
    requestInit: Object.keys(args.headers).length > 0 ? { headers: args.headers } : undefined,
  });

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const rawTools = Array.isArray((listed as { tools?: unknown[] }).tools)
      ? ((listed as { tools: Array<{ name?: unknown; description?: unknown }> }).tools)
      : [];

    return rawTools
      .filter((t) => typeof t.name === "string" && t.name.trim().length > 0)
      .map((t) => ({
        name: sanitizeToolOutputText(String(t.name)),
        ...(typeof t.description === "string" && t.description.trim().length > 0
          ? { description: sanitizeToolOutputText(t.description) }
          : {}),
      }));
  } finally {
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}

function createSupabaseStore(
  getEnv: (k: string) => string | undefined,
  allowLocalDevLoopback: boolean,
  baseFetch: typeof fetch
): ManageConnectionStore | null {
  const supabaseUrl = getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return null;
  const encryptionSecret = getEnv("CONNECTION_ENCRYPTION_KEY");

  return {
    list: (userId) => listUserConnectionsDb(supabaseUrl, serviceRoleKey, userId, baseFetch),
    resolveSecret: (userId, connectionId) =>
      resolveUserConnectionDb({
        supabaseUrl,
        serviceRoleKey,
        userId,
        connectionId,
        encryptionSecret,
        allowEphemeralDevKey: allowLocalDevLoopback,
        fetchFn: baseFetch,
      }),
    upsert: (userId, input) =>
      upsertUserConnectionDb({
        supabaseUrl,
        serviceRoleKey,
        userId,
        ...input,
        encryptionSecret,
        allowEphemeralDevKey: allowLocalDevLoopback,
        fetchFn: baseFetch,
      }),
    delete: (userId, connectionId) =>
      deleteUserConnectionDb(supabaseUrl, serviceRoleKey, userId, connectionId, baseFetch),
  };
}

export async function handleManageConnection(
  req: Request,
  deps: ManageConnectionDeps = {}
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const getEnv = deps.getEnv ?? ((k: string) => Deno.env.get(k));
  const baseFetch = deps.baseFetch ?? fetch;
  const allowLocalDevLoopback = getEnv("MCP_ALLOW_LOCAL_DEV_LOOPBACK") === "true";

  const authHeader = req.headers.get("authorization") ?? "";
  const user = deps.verifyJwt
    ? await deps.verifyJwt(authHeader)
    : await defaultVerifyJwt(authHeader, getEnv, allowLocalDevLoopback, baseFetch);

  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const store = deps.store ?? createSupabaseStore(getEnv, allowLocalDevLoopback, baseFetch);
  if (!store) {
    return jsonResponse(
      { error: "Connection storage is not configured on this server." },
      500
    );
  }

  const ssrfOptions: SsrfValidationOptions = {
    ...deps.ssrfOptions,
    allowLocalDevLoopback,
  };

  if (req.method === "GET") {
    try {
      const connections = await store.list(user.userId);
      return jsonResponse({ connections });
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : "Failed to list connections" },
        500
      );
    }
  }

  let body: ManageConnectionPayload;
  try {
    body = (await req.json()) as ManageConnectionPayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const op = body.op ?? "list";

  try {
    if (op === "list") {
      const connections = await store.list(user.userId);
      return jsonResponse({ connections });
    }

    if (op === "delete") {
      const id = typeof body.id === "string" ? body.id.trim() : "";
      if (!id) {
        return jsonResponse({ error: "Connection id is required for delete." }, 400);
      }
      const removed = await store.delete(user.userId, id);
      if (!removed) {
        return jsonResponse({ error: "Connection not found." }, 404);
      }
      return jsonResponse({ ok: true, deleted_id: id });
    }

    if (op === "discover_tools" || op === "test") {
      let targetUrlRaw = typeof body.server_url === "string" ? body.server_url.trim() : "";
      let headerName = body.auth_header_name;
      let token = typeof body.token === "string" ? body.token : undefined;

      if (body.id) {
        const existing = await store.resolveSecret(user.userId, body.id);
        if (!existing) {
          return jsonResponse({ error: "Connection not found." }, 404);
        }
        if (!targetUrlRaw) targetUrlRaw = existing.server_url;
        if (!headerName) headerName = existing.auth_header_name;
        if (token === undefined || token.trim().length === 0) {
          token = existing.token;
        }
      }

      if (!targetUrlRaw) {
        return jsonResponse({ error: "server_url is required to test an MCP connection." }, 400);
      }

      const endpointUrl = await validateOutboundMcpUrl(targetUrlRaw, ssrfOptions);
      const headers = buildStaticAuthHeaders(headerName ?? "Authorization", token);
      const discoverFn = deps.discoverTools ?? defaultDiscoverTools;
      const tools = await discoverFn({
        url: endpointUrl,
        headers,
        ssrfOptions,
        baseFetch: deps.baseFetch,
      });

      return jsonResponse({ ok: true, tools });
    }

    if (op === "upsert") {
      const connectorId = typeof body.connector_id === "string" ? body.connector_id.trim() : "";
      const label = typeof body.label === "string" ? body.label.trim() : "";
      const serverUrl = typeof body.server_url === "string" ? body.server_url.trim() : "";
      const allowedTools = Array.isArray(body.allowed_tools)
        ? [...new Set(body.allowed_tools.map((t) => String(t).trim()).filter(Boolean))]
        : [];

      if (!connectorId || !/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(connectorId)) {
        return jsonResponse(
          { error: "connector_id must be 2-64 alphanumeric, underscore, or hyphen characters." },
          400
        );
      }
      if (!label) {
        return jsonResponse({ error: "label is required." }, 400);
      }
      if (!serverUrl) {
        return jsonResponse({ error: "server_url is required." }, 400);
      }

      // Enforce SSRF rules BEFORE saving any connection URL!
      const validatedUrl = await validateOutboundMcpUrl(serverUrl, ssrfOptions);
      const authHeaderName = normalizeAuthHeaderName(body.auth_header_name);

      const saved = await store.upsert(user.userId, {
        id: typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined,
        connectorId,
        label,
        serverUrl: validatedUrl.toString(),
        allowedTools,
        status: body.status ?? "active",
        token: typeof body.token === "string" ? body.token : undefined,
        authHeaderName,
      });

      return jsonResponse({ ok: true, connection: saved });
    }

    return jsonResponse({ error: `Unsupported operation: ${String(op)}` }, 400);
  } catch (err) {
    if (err instanceof SsrfError) {
      return jsonResponse({ error: err.message }, 403);
    }
    const msg = err instanceof Error ? err.message : String(err);
    const status = /invalid auth header/i.test(msg) ? 400 : 502;
    return jsonResponse({ error: msg }, status);
  }
}
