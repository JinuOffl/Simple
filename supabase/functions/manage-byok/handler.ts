import { corsHeaders } from "../_shared/cors.ts";
import { checkProductionGuard } from "../_shared/prodGuard.ts";
import {
  encryptConnectionSecret,
} from "../_shared/secretCrypto.ts";

export interface ManageByokPayload {
  op?: "get" | "set" | "delete";
  apiKey?: string;
  provider?: string;
}

export interface ByokSecretRecord {
  user_id: string;
  provider: string;
  encrypted_secret: string;
  preview: string;
  created_at: string;
  updated_at: string;
}

export interface ByokDb {
  getByok(userId: string): Promise<ByokSecretRecord | null>;
  setByok(record: {
    user_id: string;
    provider: string;
    encrypted_secret: string;
    preview: string;
  }): Promise<void>;
  deleteByok(userId: string): Promise<boolean>;
}

export interface ManageByokDeps {
  getEnv?: (key: string) => string | undefined;
  baseFetch?: typeof fetch;
  verifyJwt?: (authHeader: string) => Promise<{ userId: string } | null>;
  db?: ByokDb;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 8) {
    return "••••••••";
  }
  const prefix = trimmed.slice(0, 4);
  const suffix = trimmed.slice(-4);
  return `${prefix}••••${suffix}`;
}

export function createDefaultByokDb(
  supabaseUrl: string,
  serviceRoleKey: string,
  fetchFn: typeof fetch = fetch
): ByokDb {
  const restBase = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1`;
  const headers = {
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Prefer: "return=representation",
  };

  return {
    async getByok(userId: string) {
      const res = await fetchFn(
        `${restBase}/byok_secrets?user_id=eq.${encodeURIComponent(userId)}&select=*`,
        { headers }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) && data[0] ? (data[0] as ByokSecretRecord) : null;
    },

    async setByok(record) {
      const now = new Date().toISOString();
      const res = await fetchFn(`${restBase}/byok_secrets`, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({
          ...record,
          updated_at: now,
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to save BYOK secret: ${await res.text()}`);
      }
    },

    async deleteByok(userId: string) {
      const res = await fetchFn(
        `${restBase}/byok_secrets?user_id=eq.${encodeURIComponent(userId)}`,
        {
          method: "DELETE",
          headers,
        }
      );
      return res.ok;
    },
  };
}

async function resolveCallerUserId(
  authHeader: string,
  getEnv: (k: string) => string | undefined,
  baseFetch: typeof fetch
): Promise<{ userId: string } | null> {
  const localDevOpen =
    getEnv("BYOK_LOCAL_DEV_OPEN") === "true" ||
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

export async function handleManageByok(
  req: Request,
  deps: ManageByokDeps = {}
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

  const user = deps.verifyJwt
    ? await deps.verifyJwt(authHeader)
    : await resolveCallerUserId(authHeader, getEnv, baseFetch);

  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let payload: ManageByokPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const op = payload.op ?? "get";

  // Initialize DB
  let db = deps.db;
  if (!db) {
    const supabaseUrl = getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL") ?? "";
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    db = createDefaultByokDb(supabaseUrl, serviceRoleKey, baseFetch);
  }

  const encryptionSecret =
    getEnv("CONNECTION_ENCRYPTION_KEY") ??
    getEnv("BYOK_ENCRYPTION_KEY") ??
    getEnv("APP_ENCRYPTION_KEY");

  const allowEphemeral =
    getEnv("ALLOW_EPHEMERAL_DEV_ENCRYPTION_KEY") === "true" ||
    getEnv("BYOK_LOCAL_DEV_OPEN") === "true" ||
    getEnv("DENO_ENV") === "test";

  try {
    switch (op) {
      case "get": {
        const existing = await db.getByok(user.userId);
        if (!existing) {
          return jsonResponse({
            has_byok: false,
          });
        }
        return jsonResponse({
          has_byok: true,
          provider: existing.provider,
          preview: existing.preview,
          updated_at: existing.updated_at,
        });
      }

      case "set": {
        const rawKey = payload.apiKey?.trim();
        if (!rawKey) {
          return jsonResponse({ error: "apiKey is required" }, 400);
        }

        // Validate key against primary endpoint
        const baseUrl = (getEnv("LLM_PRIMARY_BASE_URL") ?? "https://api.groq.com/openai/v1").replace(/\/+$/, "");
        try {
          const checkRes = await baseFetch(`${baseUrl}/models`, {
            headers: { Authorization: `Bearer ${rawKey}` },
          });
          if (checkRes.status === 401 || checkRes.status === 403) {
            return jsonResponse({ error: "Invalid API key" }, 400);
          }
        } catch {
          // Non-blocking if endpoint network failure in test/offline
        }

        const provider = (payload.provider?.trim().toLowerCase() || "groq");

        const encrypted = await encryptConnectionSecret(rawKey, encryptionSecret, {
          allowEphemeralDevKey: allowEphemeral,
        });

        const preview = maskApiKey(rawKey);

        await db.setByok({
          user_id: user.userId,
          provider,
          encrypted_secret: encrypted,
          preview,
        });

        return jsonResponse({
          success: true,
          has_byok: true,
          provider,
          preview,
        });
      }

      case "delete": {
        await db.deleteByok(user.userId);
        return jsonResponse({
          success: true,
          has_byok: false,
        });
      }

      default:
        return jsonResponse({ error: `Unsupported op '${op}'` }, 400);
    }
  } catch (err) {
    return jsonResponse(
      { error: (err as Error).message ?? "Internal BYOK error" },
      500
    );
  }
}

