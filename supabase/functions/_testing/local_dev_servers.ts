import { createFakeMcpHandler } from "./fake_mcp_server.ts";
import { handleRunMcpAction } from "../run-mcp-action/handler.ts";
import {
  handleManageConnection,
  type ManageConnectionStore,
} from "../manage-connection/handler.ts";
import { handleRunApiFetch } from "../run-api-fetch/handler.ts";
import { handleGenerateApp } from "../generate-app/handler.ts";
import type {
  DecryptedUserConnector,
  MaskedConnectionSummary,
} from "../_shared/mcpDb.ts";
import {
  decryptConnectionSecret,
  encryptConnectionSecret,
} from "../_shared/secretCrypto.ts";
import { normalizeAuthHeaderName } from "../_shared/mcpSecurity.ts";

async function loadDotEnv(): Promise<Record<string, string>> {
  const vars: Record<string, string> = {};
  try {
    const content = await Deno.readTextFile(".env");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
  } catch {
    // .env is optional
  }
  return vars;
}

const dotEnv = await loadDotEnv();
const mcpPort = Number(Deno.env.get("FAKE_MCP_PORT") ?? "8788");
const edgePort = Number(Deno.env.get("LOCAL_EDGE_PORT") ?? "8787");
const fakeMcpUrl = `http://127.0.0.1:${mcpPort}/mcp`;

const { handler: fakeMcpHandler } = createFakeMcpHandler({
  "light.living_room": false,
});

Deno.serve({ hostname: "127.0.0.1", port: mcpPort }, fakeMcpHandler);

const devBypassHeaderName = "x-simple-local-dev";
const isLocalDevNoAuth = true;

interface InMemoryConnRecord {
  id: string;
  userId: string;
  connector_id: string;
  label: string;
  server_url: string;
  allowed_tools: string[];
  status: "active" | "disabled" | "error";
  auth_header_name: string;
  encrypted_secret?: string;
  updated_at: string;
}

const localConnections = new Map<string, InMemoryConnRecord>();
// Pre-seed fake_home_assistant for immediate Phase 1b / Phase 4 local dev testing
localConnections.set("local-fake-ha", {
  id: "local-fake-ha",
  userId: "local-dev-user",
  connector_id: "fake_home_assistant",
  label: "Fake Home Assistant (Local Demo)",
  server_url: fakeMcpUrl,
  allowed_tools: ["light.toggle", "light.get_state"],
  status: "active",
  auth_header_name: "Authorization",
  updated_at: new Date().toISOString(),
});

const getLocalEnv = (k: string): string | undefined => {
  if (k === "MCP_ALLOW_LOCAL_DEV_LOOPBACK") return "true";
  if (k === "API_FETCH_LOCAL_DEV_OPEN") return "true";
  if (k === "GENERATION_LOCAL_DEV_OPEN") return "true";
  if (k === "FAKE_MCP_SERVER_URL") return fakeMcpUrl;
  return Deno.env.get(k) ?? dotEnv[k];
};

const encryptionKey = getLocalEnv("CONNECTION_ENCRYPTION_KEY");

const localStore: ManageConnectionStore = {
  list(userId): Promise<MaskedConnectionSummary[]> {
    const items: MaskedConnectionSummary[] = [];
    for (const c of localConnections.values()) {
      if (c.userId !== userId) continue;
      items.push({
        id: c.id,
        connector_id: c.connector_id,
        label: c.label,
        server_url: c.server_url,
        allowed_tools: c.allowed_tools,
        status: c.status,
        has_token: Boolean(c.encrypted_secret),
        auth_header_name: c.auth_header_name,
        updated_at: c.updated_at,
      });
    }
    return Promise.resolve(items);
  },

  async resolveSecret(userId, connectionId): Promise<DecryptedUserConnector | null> {
    const found = localConnections.get(connectionId);
    if (!found || found.userId !== userId) return null;
    const token = found.encrypted_secret
      ? await decryptConnectionSecret(found.encrypted_secret, encryptionKey, {
          allowEphemeralDevKey: true,
        })
      : undefined;
    return {
      id: found.id,
      connector_id: found.connector_id,
      label: found.label,
      server_url: found.server_url,
      allowed_tools: found.allowed_tools,
      status: found.status,
      auth_header_name: found.auth_header_name,
      token,
    };
  },

  async upsert(userId, input): Promise<MaskedConnectionSummary> {
    const id = input.id ?? `local-conn-${crypto.randomUUID().slice(0, 8)}`;
    const existing = localConnections.get(id);
    if (existing && existing.userId !== userId) {
      throw new Error("Connection not owned by current user.");
    }
    const headerName = normalizeAuthHeaderName(
      input.authHeaderName ?? existing?.auth_header_name ?? "Authorization"
    );
    const encrypted =
      input.token && input.token.trim().length > 0
        ? await encryptConnectionSecret(input.token.trim(), encryptionKey, {
            allowEphemeralDevKey: true,
          })
        : existing?.encrypted_secret;

    const saved: InMemoryConnRecord = {
      id,
      userId,
      connector_id: input.connectorId,
      label: input.label,
      server_url: input.serverUrl,
      allowed_tools: input.allowedTools,
      status: input.status ?? "active",
      auth_header_name: headerName,
      encrypted_secret: encrypted,
      updated_at: new Date().toISOString(),
    };
    localConnections.set(id, saved);

    return {
      id: saved.id,
      connector_id: saved.connector_id,
      label: saved.label,
      server_url: saved.server_url,
      allowed_tools: saved.allowed_tools,
      status: saved.status,
      has_token: Boolean(saved.encrypted_secret),
      auth_header_name: saved.auth_header_name,
      updated_at: saved.updated_at,
    };
  },

  delete(userId, connectionId): Promise<boolean> {
    const existing = localConnections.get(connectionId);
    if (!existing || existing.userId !== userId) return Promise.resolve(false);
    return Promise.resolve(localConnections.delete(connectionId));
  },
};

Deno.serve({ hostname: "127.0.0.1", port: edgePort }, (req) => {
  const url = new URL(req.url);
  const devAuthOverride = isLocalDevNoAuth
    ? {
        verifyJwt: () =>
          Promise.resolve({
            userId: req.headers.get(devBypassHeaderName) ?? "local-dev-user",
          }),
      }
    : {};

  if (url.pathname.endsWith("/manage-connection")) {
    return handleManageConnection(req, {
      getEnv: getLocalEnv,
      store: localStore,
      ...devAuthOverride,
    });
  }

  if (url.pathname.endsWith("/run-api-fetch")) {
    return handleRunApiFetch(req, {
      getEnv: getLocalEnv,
      ...devAuthOverride,
    });
  }

  if (url.pathname.endsWith("/generate-app")) {
    return handleGenerateApp(req, {
      getEnv: getLocalEnv,
      ...devAuthOverride,
    });
  }

  return handleRunMcpAction(req, {
    getEnv: getLocalEnv,
    resolveUserConnector: async ({ connectorId, userId }) => {
      for (const c of localConnections.values()) {
        if (c.userId === userId && c.connector_id === connectorId && c.status === "active") {
          const bearerToken = c.encrypted_secret
            ? await decryptConnectionSecret(c.encrypted_secret, encryptionKey, {
                allowEphemeralDevKey: true,
              })
            : undefined;
          return {
            url: c.server_url,
            bearerToken,
            authHeaderName: c.auth_header_name,
            allowedTools: c.allowed_tools,
            status: c.status,
          };
        }
      }
      return null;
    },
    ...devAuthOverride,
  });
});
