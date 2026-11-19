import { handleRunLlmAction } from "./handler.ts";

Deno.serve(async (req) => {
  return await handleRunLlmAction(req);
});
