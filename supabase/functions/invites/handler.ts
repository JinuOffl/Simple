import { corsHeaders } from "../_shared/cors.ts";
import { checkProductionGuard } from "../_shared/prodGuard.ts";

export interface InvitesPayload {
  op?: "create" | "accept" | "get_info" | "list_members" | "remove_member";
  app_id?: string;
  code?: string;
  role?: "editor" | "viewer";
  max_uses?: number;
  expires_at?: string;
  user_id?: string; // target user for remove_member
}

export interface InvitesDeps {
  getEnv?: (key: string) => string | undefined;
  verifyJwt?: (authHeader: string) => Promise<{ userId: string } | null>;
  baseFetch?: typeof fetch;
  db?: InvitesDb;
}

export interface AppInviteRecord {
  id: string;
  app_id: string;
  code: string;
  role: "editor" | "viewer";
  created_by: string;
  max_uses: number;
  uses: number;
  expires_at?: string | null;
  created_at: string;
}

export interface AppMemberRecord {
  id: string;
  app_id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
}

export interface InvitesDb {
  getApp(appId: string): Promise<{ id: string; user_id: string; name: string; icon: string; description?: string } | null>;
  getInviteByCode(code: string): Promise<AppInviteRecord | null>;
  createInvite(input: {
    app_id: string;
    code: string;
    role: "editor" | "viewer";
    created_by: string;
    max_uses: number;
    expires_at?: string | null;
  }): Promise<AppInviteRecord>;
  incrementInviteUses(inviteId: string): Promise<void>;
  getMember(appId: string, userId: string): Promise<AppMemberRecord | null>;
  addMember(appId: string, userId: string, role: "editor" | "viewer"): Promise<AppMemberRecord>;
  removeMember(appId: string, userId: string): Promise<boolean>;
  listMembers(appId: string): Promise<AppMemberRecord[]>;
  markAppShared(appId: string): Promise<void>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function generateInviteCode(): string {
  // 8-character base36 uppercase alphanumeric string
  const array = new Uint8Array(6);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 8)
    .toUpperCase();
}

/**
 * Creates default Supabase REST DB client for invites operations using service_role credentials.
 */
export function createDefaultInvitesDb(
  supabaseUrl: string,
  serviceRoleKey: string,
  fetchFn: typeof fetch = fetch
): InvitesDb {
  const restBase = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1`;
  const headers = {
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Prefer: "return=representation",
  };

  return {
    async getApp(appId: string) {
      const res = await fetchFn(
        `${restBase}/apps?id=eq.${encodeURIComponent(appId)}&select=id,user_id,name,icon,description`,
        { headers }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) && data[0] ? data[0] : null;
    },

    async getInviteByCode(code: string) {
      const res = await fetchFn(
        `${restBase}/app_invites?code=eq.${encodeURIComponent(code)}&select=*`,
        { headers }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) && data[0] ? data[0] : null;
    },

    async createInvite(input) {
      const res = await fetchFn(`${restBase}/app_invites`, {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to create invite (${res.status}): ${text}`);
      }
      const data = await res.json();
      return Array.isArray(data) ? data[0] : data;
    },

    async incrementInviteUses(inviteId: string) {
      // Fetch current uses then increment
      const fetchRes = await fetchFn(
        `${restBase}/app_invites?id=eq.${encodeURIComponent(inviteId)}&select=uses`,
        { headers }
      );
      if (fetchRes.ok) {
        const data = await fetchRes.json();
        const currentUses = data[0]?.uses ?? 0;
        await fetchFn(
          `${restBase}/app_invites?id=eq.${encodeURIComponent(inviteId)}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({ uses: currentUses + 1 }),
          }
        );
      }
    },

    async getMember(appId: string, userId: string) {
      const res = await fetchFn(
        `${restBase}/app_members?app_id=eq.${encodeURIComponent(appId)}&user_id=eq.${encodeURIComponent(userId)}&select=*`,
        { headers }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) && data[0] ? data[0] : null;
    },

    async addMember(appId: string, userId: string, role: "editor" | "viewer") {
      const res = await fetchFn(`${restBase}/app_members`, {
        method: "POST",
        headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ app_id: appId, user_id: userId, role }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Failed to add member (${res.status}): ${text}`);
      }
      const data = await res.json();
      return Array.isArray(data) ? data[0] : data;
    },

    async removeMember(appId: string, userId: string) {
      const res = await fetchFn(
        `${restBase}/app_members?app_id=eq.${encodeURIComponent(appId)}&user_id=eq.${encodeURIComponent(userId)}`,
        { method: "DELETE", headers }
      );
      return res.ok;
    },

    async listMembers(appId: string) {
      const res = await fetchFn(
        `${restBase}/app_members?app_id=eq.${encodeURIComponent(appId)}&select=*&order=created_at.asc`,
        { headers }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },

    async markAppShared(appId: string) {
      await fetchFn(`${restBase}/apps?id=eq.${encodeURIComponent(appId)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ is_shared: true }),
      });
    },
  };
}

async function resolveCallerUserId(
  authHeader: string,
  getEnv: (k: string) => string | undefined,
  baseFetch: typeof fetch
): Promise<{ userId: string } | null> {
  const localDevOpen =
    getEnv("INVITES_LOCAL_DEV_OPEN") === "true" ||
    getEnv("MCP_ALLOW_LOCAL_DEV_LOOPBACK") === "true";
  const supabaseUrl = getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey = getEnv("SUPABASE_ANON_KEY") ?? getEnv("VITE_SUPABASE_ANON_KEY");

  if (localDevOpen && (!authHeader || authHeader.includes("local-dev-preview"))) {
    return { userId: "local-dev-user" };
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return localDevOpen ? { userId: "local-dev-user" } : null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;

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

export async function handleInvites(
  req: Request,
  deps: InvitesDeps = {}
): Promise<Response> {
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
  const authHeader = req.headers.get("authorization") ?? "";

  let payload: InvitesPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const op = payload.op;
  if (!op) {
    return jsonResponse({ error: "op field is required" }, 400);
  }

  // Initialize DB
  let db = deps.db;
  if (!db) {
    const supabaseUrl = getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL") ?? "";
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    db = createDefaultInvitesDb(supabaseUrl, serviceRoleKey, baseFetch);
  }

  // ── Unauthenticated / Public Preview: `get_info` ──────────────────────────
  if (op === "get_info") {
    if (!payload.code) {
      return jsonResponse({ error: "code is required" }, 400);
    }
    const invite = await db.getInviteByCode(payload.code);
    if (!invite) {
      return jsonResponse({ error: "Invite not found" }, 404);
    }

    const app = await db.getApp(invite.app_id);
    if (!app) {
      return jsonResponse({ error: "App not found" }, 404);
    }

    const isExpired = Boolean(invite.expires_at && new Date(invite.expires_at) < new Date());
    const isExhausted = invite.uses >= invite.max_uses;

    return jsonResponse({
      valid: !isExpired && !isExhausted,
      app: {
        id: app.id,
        name: app.name,
        icon: app.icon,
        description: app.description,
      },
      role: invite.role,
      expired: isExpired,
      exhausted: isExhausted,
    });
  }

  // ── Authenticated Operations ──────────────────────────────────────────────
  const user = deps.verifyJwt
    ? await deps.verifyJwt(authHeader)
    : await resolveCallerUserId(authHeader, getEnv, baseFetch);

  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    switch (op) {
      case "create": {
        const { app_id, role = "editor", max_uses = 10, expires_at } = payload;
        if (!app_id) return jsonResponse({ error: "app_id is required" }, 400);

        const app = await db.getApp(app_id);
        if (!app) return jsonResponse({ error: "App not found" }, 404);

        // Verify caller is owner or editor of the app
        const member = await db.getMember(app_id, user.userId);
        const isOwner = app.user_id === user.userId || member?.role === "owner";
        if (!isOwner) {
          return jsonResponse({ error: "Only the app owner can create invites" }, 403);
        }

        const code = generateInviteCode();
        const invite = await db.createInvite({
          app_id,
          code,
          role,
          created_by: user.userId,
          max_uses,
          expires_at: expires_at ?? null,
        });

        // Mark app as shared
        await db.markAppShared(app_id);

        return jsonResponse({
          success: true,
          invite: {
            id: invite.id,
            code: invite.code,
            role: invite.role,
            max_uses: invite.max_uses,
            uses: invite.uses,
            expires_at: invite.expires_at,
          },
        });
      }

      case "accept": {
        const { code } = payload;
        if (!code) return jsonResponse({ error: "code is required" }, 400);

        const invite = await db.getInviteByCode(code.trim().toUpperCase());
        if (!invite) return jsonResponse({ error: "Invite not found" }, 404);

        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
          return jsonResponse({ error: "Invite has expired" }, 400);
        }

        if (invite.uses >= invite.max_uses) {
          return jsonResponse({ error: "Invite has reached maximum uses" }, 400);
        }

        // Check if user is already a member
        const existingMember = await db.getMember(invite.app_id, user.userId);
        if (existingMember) {
          return jsonResponse({
            success: true,
            app_id: invite.app_id,
            role: existingMember.role,
            already_member: true,
          });
        }

        // Add member and record usage
        const newMember = await db.addMember(invite.app_id, user.userId, invite.role);
        await db.incrementInviteUses(invite.id);
        await db.markAppShared(invite.app_id);

        return jsonResponse({
          success: true,
          app_id: invite.app_id,
          role: newMember.role,
        });
      }

      case "list_members": {
        const { app_id } = payload;
        if (!app_id) return jsonResponse({ error: "app_id is required" }, 400);

        const app = await db.getApp(app_id);
        if (!app) return jsonResponse({ error: "App not found" }, 404);

        const member = await db.getMember(app_id, user.userId);
        const isMember = app.user_id === user.userId || Boolean(member);
        if (!isMember) {
          return jsonResponse({ error: "Forbidden: not a member of this app" }, 403);
        }

        const members = await db.listMembers(app_id);
        return jsonResponse({
          members: members.map((m) => ({
            id: m.id,
            user_id: m.user_id,
            role: m.role,
            created_at: m.created_at,
            is_owner: m.user_id === app.user_id || m.role === "owner",
          })),
        });
      }

      case "remove_member": {
        const { app_id, user_id: targetUserId } = payload;
        if (!app_id || !targetUserId) {
          return jsonResponse({ error: "app_id and user_id are required" }, 400);
        }

        const app = await db.getApp(app_id);
        if (!app) return jsonResponse({ error: "App not found" }, 404);

        // Only owner can remove other members; members can remove themselves (leave)
        const isOwner = app.user_id === user.userId;
        const isSelf = targetUserId === user.userId;
        if (!isOwner && !isSelf) {
          return jsonResponse({ error: "Forbidden: cannot remove other members" }, 403);
        }

        if (targetUserId === app.user_id) {
          return jsonResponse({ error: "Cannot remove the app owner" }, 400);
        }

        await db.removeMember(app_id, targetUserId);
        return jsonResponse({ success: true });
      }

      default:
        return jsonResponse({ error: `Unknown op: ${op}` }, 400);
    }
  } catch (err) {
    console.error("invites error:", err);
    return jsonResponse({ error: (err as Error).message ?? "Internal error" }, 500);
  }
}
