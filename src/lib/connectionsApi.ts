import { supabase } from "@/lib/supabaseClient";

export interface MaskedConnection {
  id: string;
  connector_id: string;
  label: string;
  server_url: string;
  allowed_tools: string[];
  status: "active" | "disabled" | "error";
  has_token: boolean;
  auth_header_name: string;
  created_at?: string;
  updated_at?: string;
}

export interface DiscoveredMcpTool {
  name: string;
  description?: string;
}

export interface UpsertConnectionInput {
  id?: string;
  connector_id: string;
  label: string;
  server_url: string;
  allowed_tools: string[];
  status?: "active" | "disabled" | "error";
  token?: string;
  auth_header_name?: string;
}

async function invokeManageConnection<T>(body: Record<string, unknown>): Promise<T> {
  const localUrl = import.meta.env.VITE_LOCAL_MANAGE_CONNECTION_URL;
  if (import.meta.env.DEV && typeof localUrl === "string" && localUrl.trim().length > 0) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const bearer = session?.access_token ?? "local-dev-preview";

    const res = await fetch(localUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify(body),
    });

    const payload = (await res.json().catch(() => ({}))) as { error?: string } & T;
    if (!res.ok) {
      throw new Error(payload.error ?? `Local manage-connection failed (${res.status})`);
    }
    return payload;
  }

  const { data, error } = await supabase.functions.invoke<T & { error?: string }>(
    "manage-connection",
    { body }
  );

  if (error) {
    const context = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    if (context && typeof context.json === "function") {
      try {
        const errPayload = await context.json();
        if (errPayload?.error) {
          throw new Error(errPayload.error);
        }
      } catch (inner) {
        if (inner instanceof Error && inner.message && inner.message !== error.message) {
          throw inner;
        }
      }
    }
    throw new Error(error.message || "Connection operation failed");
  }

  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String(data.error));
  }

  return (data ?? {}) as T;
}

export async function listConnections(): Promise<MaskedConnection[]> {
  const res = await invokeManageConnection<{ connections?: MaskedConnection[] }>({ op: "list" });
  return res.connections ?? [];
}

export async function discoverConnectionTools(args: {
  id?: string;
  server_url?: string;
  token?: string;
  auth_header_name?: string;
}): Promise<DiscoveredMcpTool[]> {
  const res = await invokeManageConnection<{ tools?: DiscoveredMcpTool[] }>({
    op: "discover_tools",
    ...args,
  });
  return res.tools ?? [];
}

export async function saveConnection(input: UpsertConnectionInput): Promise<MaskedConnection> {
  const res = await invokeManageConnection<{ connection: MaskedConnection }>({
    op: "upsert",
    ...input,
  });
  return res.connection;
}

export async function deleteConnection(id: string): Promise<void> {
  await invokeManageConnection<{ ok: boolean }>({ op: "delete", id });
}

