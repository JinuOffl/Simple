import { decryptConnectionSecret, encryptConnectionSecret } from "./secretCrypto.ts";
import { normalizeAuthHeaderName } from "./mcpSecurity.ts";

export interface MaskedConnectionSummary {
  id: string;
  connector_id: string;
  label: string;
  server_url: string;
  allowed_tools: string[];
  status: "active" | "disabled" | "error";
  has_token: boolean;
  auth_header_name: string;
  created_at?: string;
  updated_at?: string;
}

export interface DecryptedUserConnector {
  id: string;
  connector_id: string;
  label: string;
  server_url: string;
  allowed_tools: string[];
  status: "active" | "disabled" | "error";
  auth_header_name: string;
  token?: string;
}

export interface AppMembershipResult {
  allowed: boolean;
  notFound?: boolean;
  role?: "owner" | "editor" | "viewer";
  manifest?: unknown;
}

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildStaticAuthHeaders(
  authHeaderName: string,
  token: string | undefined
): Record<string, string> {
  if (!token || token.trim().length === 0) return {};
  const headerName = normalizeAuthHeaderName(authHeaderName);
  const trimmed = token.trim();
  if (headerName.toLowerCase() === "authorization" && !/^bearer\s+/i.test(trimmed)) {
    return { [headerName]: `Bearer ${trimmed}` };
  }
  return { [headerName]: trimmed };
}

function serviceHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

export async function verifyUserAppMembership(
  supabaseUrl: string,
  serviceRoleKey: string,
  appId: string,
  userId: string,
  fetchFn: typeof fetch = fetch
): Promise<AppMembershipResult> {
  const base = supabaseUrl.replace(/\/+$/, "");

  const appRes = await fetchFn(
    `${base}/rest/v1/apps?id=eq.${encodeURIComponent(appId)}&select=id,user_id,manifest`,
    { headers: serviceHeaders(serviceRoleKey) }
  );
  if (!appRes.ok) {
    const errText = await appRes.text().catch(() => "");
    throw new Error(`Failed to verify app ownership (${appRes.status}): ${errText}`);
  }
  const apps = (await appRes.json()) as Array<{
    id: string;
    user_id: string;
    manifest: unknown;
  }>;
  const appRow = apps[0];
  if (!appRow) {
    return { allowed: false, notFound: true };
  }

  if (appRow.user_id === userId) {
    return { allowed: true, role: "owner", manifest: appRow.manifest };
  }

  const memRes = await fetchFn(
    `${base}/rest/v1/app_members?app_id=eq.${encodeURIComponent(appId)}&user_id=eq.${encodeURIComponent(userId)}&select=role`,
    { headers: serviceHeaders(serviceRoleKey) }
  );
  if (!memRes.ok) {
    const errText = await memRes.text().catch(() => "");
    throw new Error(`Failed to check app membership (${memRes.status}): ${errText}`);
  }
  const members = (await memRes.json()) as Array<{ role: "owner" | "editor" | "viewer" }>;
  const member = members[0];
  if (!member) {
    return { allowed: false };
  }

  return { allowed: true, role: member.role, manifest: appRow.manifest };
}

export async function listUserConnectionsDb(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  fetchFn: typeof fetch = fetch
): Promise<MaskedConnectionSummary[]> {
  const base = supabaseUrl.replace(/\/+$/, "");
  const res = await fetchFn(
    `${base}/rest/v1/connections?user_id=eq.${encodeURIComponent(userId)}&select=id,connector_id,label,server_url,allowed_tools,status,secret_ref,created_at,updated_at&order=updated_at.desc`,
    { headers: serviceHeaders(serviceRoleKey) }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Failed to list connections (${res.status}): ${errText}`);
  }
  const rows = (await res.json()) as Array<{
    id: string;
    connector_id: string;
    label: string;
    server_url: string;
    allowed_tools: string[];
    status: "active" | "disabled" | "error";
    secret_ref: string | null;
    created_at?: string;
    updated_at?: string;
  }>;

  const secretRes = await fetchFn(
    `${base}/rest/v1/connection_secrets?user_id=eq.${encodeURIComponent(userId)}&select=connection_id,auth_header_name`,
    { headers: serviceHeaders(serviceRoleKey) }
  );
  const headerByConn = new Map<string, string>();
  if (secretRes.ok) {
    const secretRows = (await secretRes.json()) as Array<{
      connection_id: string;
      auth_header_name: string;
    }>;
    for (const s of secretRows) {
      headerByConn.set(s.connection_id, s.auth_header_name);
    }
  } else {
    await secretRes.body?.cancel();
  }

  return rows.map((row) => ({
    id: row.id,
    connector_id: row.connector_id,
    label: row.label,
    server_url: row.server_url,
    allowed_tools: Array.isArray(row.allowed_tools) ? row.allowed_tools : [],
    status: row.status,
    has_token: Boolean(row.secret_ref) || headerByConn.has(row.id),
    auth_header_name: headerByConn.get(row.id) ?? "Authorization",
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function resolveUserConnectionDb(args: {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  connectorId?: string;
  connectionId?: string;
  encryptionSecret: string | undefined;
  allowEphemeralDevKey?: boolean;
  fetchFn?: typeof fetch;
}): Promise<DecryptedUserConnector | null> {
  const fetchFn = args.fetchFn ?? fetch;
  const base = args.supabaseUrl.replace(/\/+$/, "");

  const filter = args.connectionId
    ? `id=eq.${encodeURIComponent(args.connectionId)}&user_id=eq.${encodeURIComponent(args.userId)}`
    : `connector_id=eq.${encodeURIComponent(args.connectorId ?? "")}&user_id=eq.${encodeURIComponent(args.userId)}`;

  const res = await fetchFn(
    `${base}/rest/v1/connections?${filter}&select=id,connector_id,label,server_url,allowed_tools,status&order=updated_at.desc&limit=1`,
    { headers: serviceHeaders(args.serviceRoleKey) }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Failed to resolve connection (${res.status}): ${errText}`);
  }
  const rows = (await res.json()) as Array<{
    id: string;
    connector_id: string;
    label: string;
    server_url: string;
    allowed_tools: string[];
    status: "active" | "disabled" | "error";
  }>;
  const row = rows[0];
  if (!row) return null;

  const secretRes = await fetchFn(
    `${base}/rest/v1/connection_secrets?connection_id=eq.${encodeURIComponent(row.id)}&user_id=eq.${encodeURIComponent(args.userId)}&select=auth_header_name,encrypted_secret&limit=1`,
    { headers: serviceHeaders(args.serviceRoleKey) }
  );

  let authHeaderName = "Authorization";
  let token: string | undefined;

  if (secretRes.ok) {
    const secrets = (await secretRes.json()) as Array<{
      auth_header_name: string;
      encrypted_secret: string;
    }>;
    const sec = secrets[0];
    if (sec) {
      authHeaderName = sec.auth_header_name;
      token = await decryptConnectionSecret(sec.encrypted_secret, args.encryptionSecret, {
        allowEphemeralDevKey: args.allowEphemeralDevKey,
      });
    }
  } else {
    await secretRes.body?.cancel();
  }

  return {
    id: row.id,
    connector_id: row.connector_id,
    label: row.label,
    server_url: row.server_url,
    allowed_tools: Array.isArray(row.allowed_tools) ? row.allowed_tools : [],
    status: row.status,
    auth_header_name: authHeaderName,
    token,
  };
}

export async function upsertUserConnectionDb(args: {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  id?: string;
  connectorId: string;
  label: string;
  serverUrl: string;
  allowedTools: string[];
  status?: "active" | "disabled" | "error";
  token?: string;
  authHeaderName?: string;
  encryptionSecret: string | undefined;
  allowEphemeralDevKey?: boolean;
  fetchFn?: typeof fetch;
}): Promise<MaskedConnectionSummary> {
  const fetchFn = args.fetchFn ?? fetch;
  const base = args.supabaseUrl.replace(/\/+$/, "");
  const headerName = normalizeAuthHeaderName(args.authHeaderName);

  let savedRow: {
    id: string;
    connector_id: string;
    label: string;
    server_url: string;
    allowed_tools: string[];
    status: "active" | "disabled" | "error";
    secret_ref: string | null;
    created_at?: string;
    updated_at?: string;
  };

  let targetId = args.id;
  if (!targetId && args.connectorId.startsWith("key:")) {
    const existingRes = await fetchFn(
      `${base}/rest/v1/connections?user_id=eq.${encodeURIComponent(args.userId)}&connector_id=eq.${encodeURIComponent(args.connectorId)}&select=id&order=updated_at.desc&limit=1`,
      { headers: serviceHeaders(args.serviceRoleKey) }
    );
    if (existingRes.ok) {
      const existingRows = (await existingRes.json()) as Array<{ id: string }>;
      if (existingRows[0]?.id) {
        targetId = existingRows[0].id;
      }
    }
  }

  if (targetId) {
    const updateRes = await fetchFn(
      `${base}/rest/v1/connections?id=eq.${encodeURIComponent(targetId)}&user_id=eq.${encodeURIComponent(args.userId)}`,
      {
        method: "PATCH",
        headers: {
          ...serviceHeaders(args.serviceRoleKey),
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          connector_id: args.connectorId,
          label: args.label,
          server_url: args.serverUrl,
          allowed_tools: args.allowedTools,
          status: args.status ?? "active",
        }),
      }
    );
    if (!updateRes.ok) {
      const errText = await updateRes.text().catch(() => "");
      throw new Error(`Failed to update connection (${updateRes.status}): ${errText}`);
    }
    const updated = (await updateRes.json()) as typeof savedRow[];
    if (!updated[0]) {
      throw new Error("Connection not found or not owned by user.");
    }
    savedRow = updated[0];
  } else {
    const insertRes = await fetchFn(`${base}/rest/v1/connections`, {
      method: "POST",
      headers: {
        ...serviceHeaders(args.serviceRoleKey),
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        user_id: args.userId,
        connector_id: args.connectorId,
        label: args.label,
        server_url: args.serverUrl,
        allowed_tools: args.allowedTools,
        status: args.status ?? "active",
      }),
    });
    if (!insertRes.ok) {
      const errText = await insertRes.text().catch(() => "");
      throw new Error(`Failed to create connection (${insertRes.status}): ${errText}`);
    }
    const inserted = (await insertRes.json()) as typeof savedRow[];
    savedRow = inserted[0]!;
  }

  let hasToken = Boolean(savedRow.secret_ref);
  if (typeof args.token === "string" && args.token.trim().length > 0) {
    const encrypted = await encryptConnectionSecret(
      args.token.trim(),
      args.encryptionSecret,
      { allowEphemeralDevKey: args.allowEphemeralDevKey }
    );

    const secRes = await fetchFn(
      `${base}/rest/v1/connection_secrets?on_conflict=connection_id`,
      {
        method: "POST",
        headers: {
          ...serviceHeaders(args.serviceRoleKey),
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          connection_id: savedRow.id,
          user_id: args.userId,
          auth_header_name: headerName,
          encrypted_secret: encrypted,
        }),
      }
    );
    if (!secRes.ok) {
      const errText = await secRes.text().catch(() => "");
      throw new Error(`Failed to save connection secret (${secRes.status}): ${errText}`);
    }
    await secRes.body?.cancel();

    const refRes = await fetchFn(
      `${base}/rest/v1/connections?id=eq.${encodeURIComponent(savedRow.id)}&user_id=eq.${encodeURIComponent(args.userId)}`,
      {
        method: "PATCH",
        headers: {
          ...serviceHeaders(args.serviceRoleKey),
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ secret_ref: `secret:${savedRow.id}` }),
      }
    );
    await refRes.body?.cancel();
    hasToken = true;
  }

  return {
    id: savedRow.id,
    connector_id: savedRow.connector_id,
    label: savedRow.label,
    server_url: savedRow.server_url,
    allowed_tools: savedRow.allowed_tools ?? [],
    status: savedRow.status,
    has_token: hasToken,
    auth_header_name: headerName,
    created_at: savedRow.created_at,
    updated_at: savedRow.updated_at,
  };
}

export async function deleteUserConnectionDb(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string,
  connectionId: string,
  fetchFn: typeof fetch = fetch
): Promise<boolean> {
  const base = supabaseUrl.replace(/\/+$/, "");
  const res = await fetchFn(
    `${base}/rest/v1/connections?id=eq.${encodeURIComponent(connectionId)}&user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: {
        ...serviceHeaders(serviceRoleKey),
        Prefer: "return=representation",
      },
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Failed to delete connection (${res.status}): ${errText}`);
  }
  const deleted = (await res.json()) as Array<{ id: string }>;
  return deleted.length > 0;
}

