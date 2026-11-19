export interface RateLimitCheckArgs {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  userId: string;
  target: "generate_app" | "runtime_llm";
  limit?: number; // default: 6 for generate_app, 20 for runtime_llm
  fetchFn?: typeof fetch;
  now?: number;
}

/**
 * Checks whether user has exceeded their burst rate limit over the last 60 seconds
 * by querying usage_ledger via service role REST API.
 * Returns true if allowed, false if rate limited.
 */
export async function checkRateLimit(args: RateLimitCheckArgs): Promise<boolean> {
  const { userId, target } = args;
  if (userId === "local-dev-user") return true;

  const supabaseUrl = args.supabaseUrl;
  const serviceRoleKey = args.serviceRoleKey;
  if (!supabaseUrl || !serviceRoleKey) return true;

  const limit = args.limit ?? (target === "generate_app" ? 6 : 20);
  const now = args.now ?? Date.now();
  const sinceIso = new Date(now - 60_000).toISOString();

  const filter =
    target === "generate_app"
      ? "or=(action_kind.eq.generate_app,credit_cost_class.eq.generation)"
      : "credit_cost_class=eq.runtime_llm";

  const url = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/usage_ledger?user_id=eq.${encodeURIComponent(
    userId
  )}&${filter}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id&limit=${limit}`;

  try {
    const fn = args.fetchFn ?? fetch;
    const res = await fn(url, {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) return true; // fail open on transient db errors
    const rows = (await res.json()) as unknown[];
    return Array.isArray(rows) && rows.length < limit;
  } catch {
    return true;
  }
}
