import { handleGenerateApp } from "../generate-app/handler.ts";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * Legacy v1 endpoint compatibility shim.
 * Delegates all generation work to the v2 `generate-app` orchestrator so zero
 * hardcoded Groq prompts or unvalidated code paths remain, and unwraps
 * `manifest` for callers expecting the legacy top-level manifest response.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const response = await handleGenerateApp(req);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return response;
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    return response;
  }

  if (response.ok && payload.ok === true && payload.manifest) {
    return new Response(JSON.stringify(payload.manifest), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify(payload), {
    status: response.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
