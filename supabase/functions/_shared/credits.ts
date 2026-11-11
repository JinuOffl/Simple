import { getCreditCostForClass, type CreditCostClass } from "./plans.ts";

export interface CreditConsumeOutcome {
  allowed: boolean;
  remainingCredits: number;
  creditsUsed: number;
  monthlyCreditLimit: number;
}

export interface ConsumeCreditsParams {
  supabaseUrl: string;
  serviceRoleKey: string;
  userId: string;
  actionKind: string;
  costClass: CreditCostClass;
  appId?: string;
  metadata?: Record<string, unknown>;
  fetchFn?: typeof fetch;
}

/**
 * Calls Postgres `consume_credits` RPC using service_role credentials.
 * Fails closed if the RPC returns an error or malformed payload.
 */
export async function consumeCreditsRpc({
  supabaseUrl,
  serviceRoleKey,
  userId,
  actionKind,
  costClass,
  appId,
  metadata = {},
  fetchFn = fetch,
}: ConsumeCreditsParams): Promise<CreditConsumeOutcome> {
  const cost = getCreditCostForClass(costClass);
  const endpoint = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/consume_credits`;

  const res = await fetchFn(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      p_user_id: userId,
      p_cost: cost,
      p_action_kind: actionKind,
      p_cost_class: costClass,
      p_app_id: appId ?? null,
      p_metadata: metadata,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`consume_credits RPC failed (${res.status}): ${errText}`);
  }

  const rows = (await res.json()) as Array<{
    allowed: boolean;
    remaining_credits: number;
    credits_used: number;
    monthly_credit_limit: number;
  }>;

  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row || typeof row.allowed !== "boolean") {
    throw new Error("consume_credits RPC returned an empty or invalid response");
  }

  return {
    allowed: row.allowed,
    remainingCredits: row.remaining_credits,
    creditsUsed: row.credits_used,
    monthlyCreditLimit: row.monthly_credit_limit,
  };
}

