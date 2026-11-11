import { McpServer } from "npm:@modelcontextprotocol/sdk@1.32.2/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "npm:@modelcontextprotocol/sdk@1.32.2/server/webStandardStreamableHttp.js";
import { z } from "npm:zod@^4.4.3";

export interface FakeMcpServerState {
  lights: Record<string, boolean>;
}

export function createFakeMcpHandler(initialLights: Record<string, boolean> = { "light.living_room": false }) {
  const state: FakeMcpServerState = {
    lights: { ...initialLights },
  };

  function buildServer(): McpServer {
    const server = new McpServer({
      name: "simple-fake-home-assistant",
      version: "1.0.0",
    });

    server.registerTool(
      "light.toggle",
      {
        description: "Toggle or explicitly set a Home Assistant light entity",
        inputSchema: {
          entity_id: z.string(),
          state: z.union([z.boolean(), z.enum(["on", "off"])]).optional(),
        },
      },
      async (args: { entity_id: string; state?: boolean | "on" | "off" }) => {
        const entityId = args.entity_id || "light.living_room";
        const current = state.lights[entityId] ?? false;
        let next = !current;
        if (typeof args.state === "boolean") {
          next = args.state;
        } else if (args.state === "on") {
          next = true;
        } else if (args.state === "off") {
          next = false;
        }

        state.lights[entityId] = next;
        const label = next ? "on" : "off";

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                entity_id: entityId,
                state: label,
                is_on: next,
                summary: `${entityId} is ${label}`,
              }),
            },
          ],
        };
      }
    );

    server.registerTool(
      "light.get_state",
      {
        description: "Read the current on/off state of a light entity",
        inputSchema: {
          entity_id: z.string(),
        },
      },
      async (args: { entity_id: string }) => {
        const entityId = args.entity_id || "light.living_room";
        const current = state.lights[entityId] ?? false;
        const label = current ? "on" : "off";

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                entity_id: entityId,
                state: label,
                is_on: current,
                summary: `${entityId} is ${label}`,
              }),
            },
          ],
        };
      }
    );

    return server;
  }

  const handler = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, lights: state.lights }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname !== "/mcp") {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const server = buildServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    return await transport.handleRequest(req);
  };

  return { handler, state };
}

if (import.meta.main) {
  const port = Number(Deno.env.get("FAKE_MCP_PORT") ?? "8788");
  const { handler } = createFakeMcpHandler();
  console.log(`[fake-mcp-server] Listening on http://127.0.0.1:${port}/mcp`);
  Deno.serve({ hostname: "127.0.0.1", port }, handler);
}

