import { corsHeaders } from "../_shared/cors.ts";
import { checkProductionGuard } from "../_shared/prodGuard.ts";

declare const Deno:
  | {
      env: {
        get: (key: string) => string | undefined;
      };
    }
  | undefined;

export interface DeleteAccountDeps {
  getEnv?: (key: string) => string | undefined;
  baseFetch?: typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function defaultGetEnv(key: string): string | undefined {
  if (typeof Deno !== "undefined" && Deno.env?.get) {
    return Deno.env.get(key);
  }
  return undefined;
}

export async function handleDeleteAccount(
  req: Request,
  deps: DeleteAccountDeps = {}
): Promise<Response> {
  const getEnv = deps.getEnv ?? defaultGetEnv;
  const baseFetch = deps.baseFetch ?? fetch;

  const guardRes = checkProductionGuard(getEnv);
  if (guardRes) return guardRes;

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const token = match[1].trim();

  // Verify caller user
  const userRes = await baseFetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!userRes.ok) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const userData = (await userRes.json()) as { id?: string };
  const userId = userData.id;
  if (!userId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const restBase = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1`;
  const restHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  // 1. Delete user's owned apps (cascades app_data for owned apps)
  await baseFetch(`${restBase}/apps?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: restHeaders,
  });

  // 2. Delete user's profile row
  await baseFetch(`${restBase}/profile?id=eq.${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: restHeaders,
  });

  // 3. Delete user's byok_secrets
  await baseFetch(`${restBase}/byok_secrets?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: restHeaders,
  });

  // 4. Delete user's connections
  await baseFetch(`${restBase}/connections?user_id=eq.${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: restHeaders,
  });

  // 5. Delete Supabase Auth user record
  await baseFetch(
    `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    }
  );

  return jsonResponse({ ok: true });
}
