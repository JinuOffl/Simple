import { corsHeaders } from "../_shared/cors.ts";
import { checkProductionGuard } from "../_shared/prodGuard.ts";
import { PLAN_LIMITS } from "../_shared/plans.ts";
export { PLAN_LIMITS };

export type BillingEvent =
  | "subscription.created"
  | "subscription.updated"
  | "subscription.canceled"
  | "credits.grant";

export interface BillingWebhookPayload {
  event: BillingEvent;
  user_id: string;
  plan?: "free" | "pro" | "group";
  provider?: string;
  provider_ref?: string;
  credits?: number;
}

export interface EntitlementDbRecord {
  user_id: string;
  plan: "free" | "pro" | "group";
  active_app_limit: number;
  monthly_credit_limit: number;
  credits_used: number;
  period_start: string;
  provider?: string | null;
  provider_ref?: string | null;
  updated_at: string;
}

export interface BillingDb {
  getUser(userId: string): Promise<{ id: string; email?: string } | null>;
  getEntitlement(userId: string): Promise<EntitlementDbRecord | null>;
  updateEntitlement(
    userId: string,
    patch: Partial<EntitlementDbRecord>
  ): Promise<EntitlementDbRecord>;
  enforceActiveLimit(userId: string): Promise<{ slept_count: number; active_count: number }>;
  recordLedger(entry: {
    user_id: string;
    action_kind: string;
    credit_cost_class: string;
    credits_charged: number;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}

export interface BillingWebhookDeps {
  getEnv?: (key: string) => string | undefined;
  baseFetch?: typeof fetch;
  db?: BillingDb;
}



function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function createDefaultBillingDb(
  supabaseUrl: string,
  serviceRoleKey: string,
  fetchFn: typeof fetch = fetch
): BillingDb {
  const restBase = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1`;
  const headers = {
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Prefer: "return=representation",
  };

  return {
    async getUser(userId: string) {
      const res = await fetchFn(
        `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
        { headers }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return data?.id ? { id: data.id, email: data.email } : null;
    },

    async getEntitlement(userId: string) {
      const res = await fetchFn(
        `${restBase}/entitlements?user_id=eq.${encodeURIComponent(userId)}&select=*`,
        { headers }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data) && data[0] ? (data[0] as EntitlementDbRecord) : null;
    },

    async updateEntitlement(userId: string, patch: Partial<EntitlementDbRecord>) {
      const res = await fetchFn(
        `${restBase}/entitlements?user_id=eq.${encodeURIComponent(userId)}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify(patch),
        }
      );
      if (!res.ok) {
        throw new Error(`Failed to update entitlements: ${await res.text()}`);
      }
      const data = await res.json();
      return Array.isArray(data) && data[0]
        ? (data[0] as EntitlementDbRecord)
        : ({ user_id: userId, ...patch } as EntitlementDbRecord);
    },

    async enforceActiveLimit(userId: string) {
      const res = await fetchFn(`${restBase}/rpc/enforce_active_limit`, {
        method: "POST",
        headers,
        body: JSON.stringify({ p_user_id: userId }),
      });
      if (!res.ok) return { slept_count: 0, active_count: 0 };
      const data = await res.json();
      const first = Array.isArray(data) ? data[0] : data;
      return {
        slept_count: first?.slept_count ?? 0,
        active_count: first?.active_count ?? 0,
      };
    },

    async recordLedger(entry) {
      await fetchFn(`${restBase}/usage_ledger`, {
        method: "POST",
        headers,
        body: JSON.stringify(entry),
      });
    },
  };
}

export async function handleBillingWebhook(
  req: Request,
  deps: BillingWebhookDeps = {}
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

  // ── Secret Verification ───────────────────────────────────────────────────
  const expectedSecret = getEnv("BILLING_WEBHOOK_SECRET");
  const localDevOpen = getEnv("BILLING_LOCAL_DEV_OPEN") === "true";

  const secretHeader =
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-billing-secret") ??
    "";

  const authHeader = req.headers.get("authorization") ?? "";
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  const providedBearer = bearerMatch ? bearerMatch[1].trim() : "";

  const providedSecret = secretHeader || providedBearer;

  const isAuthorized =
    Boolean(expectedSecret && providedSecret === expectedSecret) ||
    (localDevOpen && (!expectedSecret || providedSecret === "dev-webhook-secret"));

  if (!isAuthorized) {
    return jsonResponse({ error: "Unauthorized webhook caller" }, 401);
  }

  // ── Parse Body ────────────────────────────────────────────────────────────
  let payload: BillingWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { event, user_id } = payload;
  if (!event || !user_id) {
    return jsonResponse({ error: "event and user_id are required fields" }, 400);
  }

  // ── Initialize DB ─────────────────────────────────────────────────────────
  let db = deps.db;
  if (!db) {
    const supabaseUrl = getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL") ?? "";
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    db = createDefaultBillingDb(supabaseUrl, serviceRoleKey, baseFetch);
  }

  // ── Execute Event ─────────────────────────────────────────────────────────
  try {
    switch (event) {
      case "subscription.created":
      case "subscription.updated": {
        const plan = payload.plan ?? "pro";
        if (plan !== "free" && plan !== "pro" && plan !== "group") {
          return jsonResponse({ error: `Invalid plan '${plan}'` }, 400);
        }

        const limits = PLAN_LIMITS[plan];
        const patch: Partial<EntitlementDbRecord> = {
          plan,
          active_app_limit: limits.activeAppLimit,
          monthly_credit_limit: limits.monthlyCreditLimit,
          provider: payload.provider ?? "dev",
          provider_ref: payload.provider_ref ?? null,
          updated_at: new Date().toISOString(),
        };

        const updated = await db.updateEntitlement(user_id, patch);
        const limitResult = await db.enforceActiveLimit(user_id);

        await db.recordLedger({
          user_id,
          action_kind: "subscription_update",
          credit_cost_class: "generation",
          credits_charged: 0,
          metadata: {
            event,
            plan,
            provider: payload.provider,
            provider_ref: payload.provider_ref,
            slept_count: limitResult.slept_count,
          },
        });

        return jsonResponse({
          success: true,
          event,
          entitlement: updated,
          slept_excess_apps: limitResult.slept_count,
        });
      }

      case "subscription.canceled": {
        const freeLimits = PLAN_LIMITS.free;
        const patch: Partial<EntitlementDbRecord> = {
          plan: "free",
          active_app_limit: freeLimits.activeAppLimit,
          monthly_credit_limit: freeLimits.monthlyCreditLimit,
          provider: payload.provider ?? "dev",
          provider_ref: null,
          updated_at: new Date().toISOString(),
        };

        const updated = await db.updateEntitlement(user_id, patch);
        const limitResult = await db.enforceActiveLimit(user_id);

        await db.recordLedger({
          user_id,
          action_kind: "subscription_cancel",
          credit_cost_class: "generation",
          credits_charged: 0,
          metadata: {
            event,
            plan: "free",
            slept_count: limitResult.slept_count,
          },
        });

        return jsonResponse({
          success: true,
          event,
          entitlement: updated,
          slept_excess_apps: limitResult.slept_count,
        });
      }

      case "credits.grant": {
        const grantCredits = Number(payload.credits);
        if (!Number.isFinite(grantCredits) || grantCredits <= 0) {
          return jsonResponse({ error: "credits must be a positive number" }, 400);
        }

        const current = await db.getEntitlement(user_id);
        const currentLimit = current?.monthly_credit_limit ?? 100;
        const newLimit = currentLimit + grantCredits;

        const updated = await db.updateEntitlement(user_id, {
          monthly_credit_limit: newLimit,
          updated_at: new Date().toISOString(),
        });

        await db.recordLedger({
          user_id,
          action_kind: "credits_grant",
          credit_cost_class: "generation",
          credits_charged: 0,
          metadata: {
            granted: grantCredits,
            new_limit: newLimit,
          },
        });

        return jsonResponse({
          success: true,
          event,
          granted_credits: grantCredits,
          entitlement: updated,
        });
      }

      default:
        return jsonResponse({ error: `Unsupported event '${event}'` }, 400);
    }
  } catch (err) {
    return jsonResponse(
      { error: (err as Error).message ?? "Internal billing error" },
      500
    );
  }
}

