import { handleInvites } from "./handler.ts";

Deno.serve(async (req) => {
  return await handleInvites(req);
});
