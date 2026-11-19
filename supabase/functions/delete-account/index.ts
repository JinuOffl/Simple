import { handleDeleteAccount } from "./handler.ts";

Deno.serve(async (req) => {
  return await handleDeleteAccount(req);
});
