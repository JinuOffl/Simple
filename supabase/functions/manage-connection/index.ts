import { handleManageConnection } from "./handler.ts";

Deno.serve((req) => handleManageConnection(req));
