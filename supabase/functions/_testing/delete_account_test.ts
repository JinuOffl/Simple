import { assertEquals } from "jsr:@std/assert@1";
import { handleDeleteAccount } from "../delete-account/handler.ts";

Deno.test("delete-account rejects request without Authorization header with 401", async () => {
  const req = new Request("https://simple.edge/delete-account", {
    method: "POST",
  });

  const getEnv = (k: string) => {
    if (k === "SUPABASE_URL") return "https://mock.supabase.co";
    if (k === "SUPABASE_SERVICE_ROLE_KEY") return "mock-service-role-key";
    return undefined;
  };

  const res = await handleDeleteAccount(req, { getEnv });
  assertEquals(res.status, 401);
  const data = await res.json();
  assertEquals(data.error, "Unauthorized");
});

Deno.test("delete-account deletes owned apps, profile, byok, connections, and auth user", async () => {
  const deletedUrls: string[] = [];

  const mockFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";

    if (url.includes("/auth/v1/user") && method === "GET") {
      return new Response(JSON.stringify({ id: "user-delete-456" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (method === "DELETE") {
      deletedUrls.push(url);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  };

  const getEnv = (k: string) => {
    if (k === "SUPABASE_URL") return "https://mock.supabase.co";
    if (k === "SUPABASE_SERVICE_ROLE_KEY") return "mock-service-role-key";
    return undefined;
  };

  const req = new Request("https://simple.edge/delete-account", {
    method: "POST",
    headers: {
      Authorization: "Bearer valid-user-jwt",
    },
  });

  const res = await handleDeleteAccount(req, { getEnv, baseFetch: mockFetch });
  assertEquals(res.status, 200);
  const data = await res.json();
  assertEquals(data.ok, true);

  assertEquals(deletedUrls.length, 5);
  assertEquals(
    deletedUrls.some((u) => u.includes("/rest/v1/apps?user_id=eq.user-delete-456")),
    true
  );
  assertEquals(
    deletedUrls.some((u) => u.includes("/rest/v1/profile?id=eq.user-delete-456")),
    true
  );
  assertEquals(
    deletedUrls.some((u) => u.includes("/rest/v1/byok_secrets?user_id=eq.user-delete-456")),
    true
  );
  assertEquals(
    deletedUrls.some((u) => u.includes("/rest/v1/connections?user_id=eq.user-delete-456")),
    true
  );
  assertEquals(
    deletedUrls.some((u) => u.includes("/auth/v1/admin/users/user-delete-456")),
    true
  );
});
