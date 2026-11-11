import { handleRunApiFetch } from "./handler.ts";

Deno.serve((req) => handleRunApiFetch(req));
