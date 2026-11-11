import { handleRunMcpAction } from "./handler.ts";

Deno.serve((req) => handleRunMcpAction(req));

