import { handleManageByok } from "./handler.ts";

Deno.serve(async (req) => {
  return await handleManageByok(req);
});

