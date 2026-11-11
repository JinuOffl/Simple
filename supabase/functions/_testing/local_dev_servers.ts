import { createFakeMcpHandler } from "./fake_mcp_server.ts";
import { handleRunMcpAction } from "../run-mcp-action/handler.ts";

async function loadDotEnv(): Promise<Record<string, string>> {
  const vars: Record<string, string> = {};
  try {
    const content = await Deno.readTextFile(".env");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      vars[key] = val;
    }
  } catch {
    // .env is optional
  }
  return vars;
}

const dotEnv = await loadDotEnv();
const mcpPort = Number(Deno.env.get("FAKE_MCP_PORT") ?? "8788");
const edgePort = Number(Deno.env.get("LOCAL_EDGE_PORT") ?? "8787");
const fakeMcpUrl = `http://127.0.0.1:${mcpPort}/mcp`;

const { handler: fakeMcpHandler } = createFakeMcpHandler({
  "light.living_room": false,
});

Deno.serve({ hostname: "127.0.0.1", port: mcpPort }, fakeMcpHandler);

const devBypassHeaderName = "x-simple-local-dev";
const isLocalDevNoAuth = Deno.env.get("MCP_LOCAL_DEV_OPEN") === "true";

Deno.serve({ hostname: "127.0.0.1", port: edgePort }, (req) => {
  return handleRunMcpAction(req, {
    getEnv: (k) => {
      if (k === "MCP_ALLOW_LOCAL_DEV_LOOPBACK") return "true";
      if (k === "FAKE_MCP_SERVER_URL") return fakeMcpUrl;
      return Deno.env.get(k) ?? dotEnv[k];
    },
    ...(isLocalDevNoAuth
      ? {
          verifyJwt: () =>
            Promise.resolve({
              userId: req.headers.get(devBypassHeaderName) ?? "local-dev-user",
            }),
        }
      : {}),
  });
});

console.log(`[local-dev] Fake MCP server listening on ${fakeMcpUrl}`);
console.log(`[local-dev] Local run-mcp-action listening on http://127.0.0.1:${edgePort}`);

