import { handleBillingWebhook } from "./handler.ts";

Deno.serve(async (req) => {
  return await handleBillingWebhook(req);
});

