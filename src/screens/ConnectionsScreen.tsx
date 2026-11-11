import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteConnection,
  discoverConnectionTools,
  listConnections,
  saveConnection,
  type DiscoveredMcpTool,
  type MaskedConnection,
} from "@/lib/connectionsApi";
import { isHighRiskMcpTool } from "../../supabase/functions/_shared/mcpSecurity.ts";

export function ConnectionsScreen() {
  const navigate = useNavigate();

  const [connections, setConnections] = useState<MaskedConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [connectorId, setConnectorId] = useState("home_assistant");
  const [label, setLabel] = useState("Home Assistant");
  const [serverUrl, setServerUrl] = useState("");
  const [authHeaderName, setAuthHeaderName] = useState("Authorization");
  const [token, setToken] = useState("");
  const [allowedToolsText, setAllowedToolsText] = useState("light.toggle, light.get_state");
  const [discoveredTools, setDiscoveredTools] = useState<DiscoveredMcpTool[]>([]);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadList = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listConnections();
      setConnections(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load connections.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadList();
  }, []);

  const parseToolsSet = (): Set<string> =>
    new Set(
      allowedToolsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    );

  const toggleAllowedTool = (toolName: string) => {
    const next = parseToolsSet();
    if (next.has(toolName)) {
      next.delete(toolName);
    } else {
      next.add(toolName);
    }
    setAllowedToolsText([...next].join(", "));
  };

  const resetForm = () => {
    setEditingId(undefined);
    setConnectorId("home_assistant");
    setLabel("Home Assistant");
    setServerUrl("");
    setAuthHeaderName("Authorization");
    setToken("");
    setAllowedToolsText("light.toggle, light.get_state");
    setDiscoveredTools([]);
  };

  const handlePresetHomeAssistant = () => {
    setEditingId(undefined);
    setConnectorId("home_assistant");
    setLabel("Home Assistant");
    setServerUrl("");
    setAuthHeaderName("Authorization");
    setToken("");
    setAllowedToolsText("light.toggle, light.get_state");
    setDiscoveredTools([]);
    setError(null);
    setStatusMessage(null);
  };

  const handleDiscoverTools = async () => {
    setTesting(true);
    setError(null);
    setStatusMessage(null);
    try {
      const tools = await discoverConnectionTools({
        ...(editingId ? { id: editingId } : {}),
        server_url: serverUrl.trim(),
        ...(token.trim() ? { token: token.trim() } : {}),
        auth_header_name: authHeaderName.trim() || "Authorization",
      });
      setDiscoveredTools(tools);
      if (tools.length > 0 && allowedToolsText.trim().length === 0) {
        setAllowedToolsText(tools.map((t) => t.name).join(", "));
      }
      setStatusMessage(
        `Connected cleanly: discovered ${tools.length} tool${tools.length === 1 ? "" : "s"}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection test failed.");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setStatusMessage(null);

    try {
      const allowedTools = [...parseToolsSet()];
      const saved = await saveConnection({
        ...(editingId ? { id: editingId } : {}),
        connector_id: connectorId.trim(),
        label: label.trim(),
        server_url: serverUrl.trim(),
        allowed_tools: allowedTools,
        auth_header_name: authHeaderName.trim() || "Authorization",
        ...(token.trim() ? { token: token.trim() } : {}),
      });
      setToken("");
      setEditingId(undefined);
      setStatusMessage(`Saved "${saved.label}" (${saved.connector_id}). Secret token sealed server-side.`);
      resetForm();
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save connection.");
    } finally {
      setSaving(false);
    }
  };

  const handleEditExisting = (conn: MaskedConnection) => {
    setEditingId(conn.id);
    setConnectorId(conn.connector_id);
    setLabel(conn.label);
    setServerUrl(conn.server_url);
    setAuthHeaderName(conn.auth_header_name || "Authorization");
    setToken("");
    setAllowedToolsText(conn.allowed_tools.join(", "));
    setDiscoveredTools([]);
    setError(null);
    setStatusMessage(`Editing "${conn.label}". Leave token blank to keep existing sealed secret.`);
  };

  const handleTestSaved = async (conn: MaskedConnection) => {
    setTesting(true);
    setError(null);
    setStatusMessage(null);
    try {
      const tools = await discoverConnectionTools({ id: conn.id });
      setStatusMessage(
        `"${conn.label}" reachable: ${tools.length} tool${tools.length === 1 ? "" : "s"} available.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed testing "${conn.label}".`);
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async (conn: MaskedConnection) => {
    setError(null);
    setStatusMessage(null);
    try {
      await deleteConnection(conn.id);
      if (editingId === conn.id) resetForm();
      setStatusMessage(`Removed connection "${conn.label}".`);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete connection.");
    }
  };

  const selectedToolSet = parseToolsSet();

  return (
    <div className="min-h-screen flex flex-col bg-gradient-mesh">
      <header className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-n-border">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-n-text3 hover:text-white text-[11px] uppercase tracking-wider transition-colors"
        >
          ← back
        </button>

        <h1
          className="font-doto text-white tracking-widest uppercase"
          style={{ fontSize: "16px", fontVariationSettings: "'ROND' 0" }}
        >
          CONNECTIONS
        </h1>

        <span className="nt-tag">mcp · https</span>
      </header>

      <main className="flex-1 max-w-lg w-full mx-auto px-5 py-6 space-y-6">
        {/* ADR 005 & SSRF policy notice */}
        <section className="glass p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="nt-tag">auth policy · adr-005</span>
            <span className="text-[10px] font-mono text-n-text3">API KEY / BEARER TOKEN ONLY</span>
          </div>
          <p className="text-xs text-n-text2 leading-relaxed">
            Connect remote Streamable HTTP MCP servers authenticated via static Bearer Token or
            API Key header. OAuth connectors are deferred. Secrets are sealed server-side and never
            returned to the browser.
          </p>
          <p className="text-[11px] text-n-text3 leading-relaxed">
            Home Assistant requires your public HTTPS URL (Nabu Casa or Cloudflare/Tailscale HTTPS
            tunnel). Plain HTTP and private/LAN IPs are blocked by the server-side SSRF guard.
          </p>
        </section>

        {error && (
          <div
            role="alert"
            className="bg-n-surface border border-white/30 rounded-sm px-4 py-3 text-xs text-white"
          >
            {error}
          </div>
        )}

        {statusMessage && (
          <div className="bg-n-surface border border-n-border2 rounded-sm px-4 py-3 text-xs text-n-text2">
            {statusMessage}
          </div>
        )}

        {/* Saved connections */}
        <section className="space-y-3">
          <h2 className="text-n-text2 text-[10px] uppercase tracking-[0.16em]">
            your saved connections
          </h2>

          {loading ? (
            <div className="glass p-4 text-xs text-n-text3">Loading connections…</div>
          ) : connections.length === 0 ? (
            <div className="glass p-4 text-xs text-n-text3">
              No external MCP connections saved yet. Add one below.
            </div>
          ) : (
            <div className="space-y-3">
              {connections.map((conn) => (
                <div key={conn.id} className="glass p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-white text-xs font-medium truncate">{conn.label}</p>
                      <p className="text-[10px] font-mono text-n-text3 truncate">
                        {conn.connector_id} · {conn.server_url}
                      </p>
                    </div>
                    <span className="nt-tag shrink-0">{conn.status}</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {conn.has_token && (
                      <span className="nt-tag">{conn.auth_header_name} sealed</span>
                    )}
                    {conn.allowed_tools.map((tool) => (
                      <span
                        key={tool}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-n-surface border border-n-border text-n-text2"
                      >
                        {tool}
                        {isHighRiskMcpTool(tool) ? " · confirm" : ""}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={testing}
                      onClick={() => void handleTestSaved(conn)}
                      className="btn-ghost text-[10px] py-1.5 px-3"
                    >
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditExisting(conn)}
                      className="btn-ghost text-[10px] py-1.5 px-3"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(conn)}
                      className="btn-ghost text-[10px] py-1.5 px-3 text-n-text3 hover:text-white"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Add / Update Connection Form */}
        <section className="glass p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-white text-xs uppercase tracking-wider font-medium">
              {editingId ? "Edit Connection" : "Add MCP Connection"}
            </h2>
            <button
              type="button"
              onClick={handlePresetHomeAssistant}
              className="nt-tag hover:border-n-border2 hover:text-white cursor-pointer"
            >
              Preset: Home Assistant
            </button>
          </div>

          <form onSubmit={(e) => void handleSave(e)} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-n-text3">
                  Connector ID
                </span>
                <input
                  type="text"
                  required
                  value={connectorId}
                  onChange={(e) => setConnectorId(e.target.value)}
                  placeholder="home_assistant"
                  className="w-full bg-n-surface border border-n-border rounded-sm px-3 py-2 text-xs text-white outline-none focus:border-n-border2"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-n-text3">
                  Display Label
                </span>
                <input
                  type="text"
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Home Assistant"
                  className="w-full bg-n-surface border border-n-border rounded-sm px-3 py-2 text-xs text-white outline-none focus:border-n-border2"
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-n-text3">
                HTTPS Server URL
              </span>
              <input
                type="url"
                required
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://your-instance.ui.nabu.casa/mcp_server/sse"
                className="w-full bg-n-surface border border-n-border rounded-sm px-3 py-2 text-xs text-white outline-none focus:border-n-border2"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-n-text3">
                  Auth Header Name
                </span>
                <input
                  type="text"
                  value={authHeaderName}
                  onChange={(e) => setAuthHeaderName(e.target.value)}
                  placeholder="Authorization"
                  className="w-full bg-n-surface border border-n-border rounded-sm px-3 py-2 text-xs text-white outline-none focus:border-n-border2"
                />
              </label>

              <label className="block space-y-1 sm:col-span-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-n-text3">
                  Bearer Token / API Key
                </span>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={editingId ? "Leave blank to keep saved secret" : "Paste static token"}
                  autoComplete="off"
                  className="w-full bg-n-surface border border-n-border rounded-sm px-3 py-2 text-xs text-white outline-none focus:border-n-border2"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={testing || (!serverUrl.trim() && !editingId)}
                onClick={() => void handleDiscoverTools()}
                className="btn-ghost text-[10px]"
              >
                {testing ? "Testing…" : "Test & Discover Tools"}
              </button>
            </div>

            {discoveredTools.length > 0 && (
              <div className="space-y-2 border border-n-border bg-n-surface p-3 rounded-sm">
                <p className="text-[10px] font-mono uppercase tracking-wider text-n-text2">
                  Discovered Tools (Consent Allowlist)
                </p>
                <div className="space-y-1.5">
                  {discoveredTools.map((tool) => {
                    const checked = selectedToolSet.has(tool.name);
                    const highRisk = isHighRiskMcpTool(tool.name);
                    return (
                      <label
                        key={tool.name}
                        className="flex items-start gap-2 text-xs text-n-text2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAllowedTool(tool.name)}
                          className="mt-0.5"
                        />
                        <span>
                          <span className="font-mono text-white">{tool.name}</span>
                          {highRisk && (
                            <span className="ml-1.5 nt-tag text-[9px]">high-risk confirm</span>
                          )}
                          {tool.description && (
                            <span className="block text-[10px] text-n-text3">
                              {tool.description}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <label className="block space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-n-text3">
                Allowed Tools (Comma-Separated Consented Allowlist)
              </span>
              <input
                type="text"
                value={allowedToolsText}
                onChange={(e) => setAllowedToolsText(e.target.value)}
                placeholder="light.toggle, light.get_state"
                className="w-full bg-n-surface border border-n-border rounded-sm px-3 py-2 text-xs font-mono text-white outline-none focus:border-n-border2"
              />
            </label>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving} className="btn-primary flex-1">
                {saving ? "Saving…" : editingId ? "Update Connection" : "Save Connection"}
              </button>
              {editingId && (
                <button type="button" onClick={resetForm} className="btn-ghost">
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}
