import { corsHeaders } from "./cors.ts";

const DEV_OPEN_ENV_VARS = [
  "GENERATION_LOCAL_DEV_OPEN",
  "MCP_ALLOW_LOCAL_DEV_LOOPBACK",
  "API_FETCH_LOCAL_DEV_OPEN",
  "INVITES_LOCAL_DEV_OPEN",
  "BYOK_LOCAL_DEV_OPEN",
  "BILLING_LOCAL_DEV_OPEN",
  "LLM_ACTION_LOCAL_DEV_OPEN",
] as const;

/**
 * Startup security check for all Edge Functions.
 * In production (DENO_DEPLOYMENT_ID is set), having any local-dev bypass flags set to "true"
 * indicates a critical misconfiguration that could bypass authentication or SSRF controls.
 */
export function checkProductionGuard(
  getEnv: (key: string) => string | undefined
): Response | null {
  const isProd = Boolean(getEnv("DENO_DEPLOYMENT_ID"));
  if (!isProd) return null;

  for (const envVar of DEV_OPEN_ENV_VARS) {
    if (getEnv(envVar) === "true") {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return null;
}
