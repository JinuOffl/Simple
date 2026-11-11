import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  createSsrfSafeFetch,
  isBlockedIp,
  SsrfError,
  validateOutboundMcpUrl,
} from "../_shared/ssrf.ts";
import { createFakeMcpHandler } from "./fake_mcp_server.ts";
import { handleRunMcpAction } from "../run-mcp-action/handler.ts";

Deno.test("SSRF guard blocks HTTP, private, loopback, metadata, CGNAT, and IPv6 vectors by default", async () => {
  const blockedUrls = [
    "http://example.com/mcp",
    "http://127.0.0.1:8788/mcp",
    "https://127.0.0.1/mcp",
    "https://localhost/mcp",
    "https://sub.localhost/mcp",
    "https://homeassistant.local/mcp",
    "https://service.internal/mcp",
    "https://169.254.169.254/latest/meta-data/",
    "https://metadata.google.internal/computeMetadata/v1/",
    "https://10.0.0.5/mcp",
    "https://172.16.0.10/mcp",
    "https://192.168.1.50/mcp",
    "https://100.64.1.2/mcp",
    "https://0.0.0.0/mcp",
    "https://[::1]/mcp",
    "https://[::ffff:127.0.0.1]/mcp",
    "https://[::ffff:169.254.169.254]/mcp",
    "https://[fe80::1]/mcp",
    "https://[fc00::1]/mcp",
    "https://user:pass@example.com/mcp",
  ];

  for (const url of blockedUrls) {
    await assertRejects(
      () =>
        validateOutboundMcpUrl(url, {
          resolveDns: () => Promise.resolve(["93.184.216.34"]),
        }),
      SsrfError,
      undefined,
      `Expected URL to be blocked: ${url}`
    );
  }
});

Deno.test("SSRF guard rejects DNS rebinding / private DNS answers and allows valid HTTPS public host", async () => {
  await assertRejects(
    () =>
      validateOutboundMcpUrl("https://evil.example.com/mcp", {
        resolveDns: () => Promise.resolve(["93.184.216.34", "169.254.169.254"]),
      }),
    SsrfError
  );

  await assertRejects(
    () =>
      validateOutboundMcpUrl("https://evil-v6.example.com/mcp", {
        resolveDns: () => Promise.resolve(["fe80::1234"]),
      }),
    SsrfError
  );

  const valid = await validateOutboundMcpUrl("https://mcp.example.com/mcp", {
    resolveDns: () => Promise.resolve(["93.184.216.34"]),
  });
  assertEquals(valid.href, "https://mcp.example.com/mcp");
});

Deno.test("SSRF guard local dev loopback flag permits only loopback and still blocks metadata/private IPs", async () => {
  const allowed = await validateOutboundMcpUrl("http://127.0.0.1:8788/mcp", {
    allowLocalDevLoopback: true,
  });
  assertEquals(allowed.href, "http://127.0.0.1:8788/mcp");

  await assertRejects(
    () =>
      validateOutboundMcpUrl("http://169.254.169.254/latest/meta-data/", {
        allowLocalDevLoopback: true,
      }),
    SsrfError
  );

  await assertRejects(
    () =>
      validateOutboundMcpUrl("https://192.168.1.1/mcp", {
        allowLocalDevLoopback: true,
      }),
    SsrfError
  );

  await assertRejects(
    () =>
      validateOutboundMcpUrl("http://example.com/mcp", {
        allowLocalDevLoopback: true,
        resolveDns: () => Promise.resolve(["93.184.216.34"]),
      }),
    SsrfError
  );

  assertEquals(isBlockedIp("::ffff:127.0.0.1", true), true);
});

Deno.test("createSsrfSafeFetch blocks HTTP 3xx redirects", async () => {
  const safeFetch = createSsrfSafeFetch({
    resolveDns: () => Promise.resolve(["93.184.216.34"]),
    baseFetch: () =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        })
      ),
  });

  await assertRejects(
    () => safeFetch("https://mcp.example.com/mcp"),
    SsrfError
  );
});

Deno.test("handleRunMcpAction rejects unauthenticated requests and SSRF endpoints end-to-end", async () => {
  const noAuthReq = new Request("http://localhost/run-mcp-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: { kind: "mcp_call", connector_id: "fake_home_assistant", tool_name: "light.toggle" },
    }),
  });
  const unauthRes = await handleRunMcpAction(noAuthReq, {
    getEnv: () => undefined,
  });
  assertEquals(unauthRes.status, 401);

  const ssrfReq = new Request("http://localhost/run-mcp-action", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer valid-user-token",
    },
    body: JSON.stringify({
      action: { kind: "mcp_call", connector_id: "evil_imds", tool_name: "light.toggle" },
    }),
  });
  const ssrfRes = await handleRunMcpAction(ssrfReq, {
    verifyJwt: () => Promise.resolve({ userId: "u1" }),
    resolveConnector: () => ({ url: "https://169.254.169.254/latest/meta-data/" }),
    getEnv: () => undefined,
  });
  assertEquals(ssrfRes.status, 403);
});

Deno.test("live HTTP round-trip: fetch -> run-mcp-action server -> fake MCP server flips light state", async () => {
  const { handler: mcpHandler, state } = createFakeMcpHandler({ "light.living_room": false });
  const mcpAc = new AbortController();
  const mcpServer = Deno.serve(
    { hostname: "127.0.0.1", port: 0, signal: mcpAc.signal, onListen() {} },
    mcpHandler
  );
  const mcpPort = (mcpServer.addr as Deno.NetAddr).port;

  const edgeAc = new AbortController();
  const edgeServer = Deno.serve(
    { hostname: "127.0.0.1", port: 0, signal: edgeAc.signal, onListen() {} },
    (req) =>
      handleRunMcpAction(req, {
        getEnv: (k) => {
          if (k === "MCP_ALLOW_LOCAL_DEV_LOOPBACK") return "true";
          if (k === "FAKE_MCP_SERVER_URL") return `http://127.0.0.1:${mcpPort}/mcp`;
          return undefined;
        },
        verifyJwt: (auth) =>
          Promise.resolve(auth === "Bearer test-jwt" ? { userId: "user-123" } : null),
      })
  );
  const edgePort = (edgeServer.addr as Deno.NetAddr).port;

  try {
    const preflight = await fetch(`http://127.0.0.1:${edgePort}/`, { method: "OPTIONS" });
    await preflight.body?.cancel();
    assertEquals(preflight.status, 200);
    assertEquals(preflight.headers.get("access-control-allow-origin"), "*");

    const postToggle = async (desired: boolean) => {
      const res = await fetch(`http://127.0.0.1:${edgePort}/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-jwt",
        },
        body: JSON.stringify({
          action: {
            id: "a_toggle_light",
            kind: "mcp_call",
            connector_id: "fake_home_assistant",
            tool_name: "light.toggle",
            params: {
              entity_id: "light.living_room",
              state: "{{light_state}}",
            },
          },
          app_data: { light_state: desired },
        }),
      });
      assertEquals(res.status, 200);
      return (await res.json()) as { result: string; raw: { connector_id: string } };
    };

    const first = await postToggle(true);
    assertEquals(first.result, "light.living_room is on");
    assertEquals(state.lights["light.living_room"], true);

    const second = await postToggle(false);
    assertEquals(second.result, "light.living_room is off");
    assertEquals(state.lights["light.living_room"], false);
  } finally {
    edgeAc.abort();
    mcpAc.abort();
    await Promise.all([edgeServer.finished, mcpServer.finished]);
  }
});

