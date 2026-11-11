import { handleGenerateApp } from "./handler.ts";

Deno.serve((req) => handleGenerateApp(req));

