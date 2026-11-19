import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ManifestRenderer } from "@/renderer/ManifestRenderer";
import { mcpToggleManifest } from "@/demo/mcpToggleManifest";

export function McpDemoScreen() {
  const navigate = useNavigate();
  const [appData, setAppData] = useState<Record<string, unknown>>({
    light_state: false,
  });

  const handleDataChange = (key: string, value: unknown) => {
    setAppData((prev) => ({ ...prev, [key]: value }));
  };

  const usingLocalProxy = Boolean(import.meta.env.DEV && import.meta.env.VITE_LOCAL_MCP_ACTION_URL);

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-mesh">
      <header className="px-4 py-4 flex items-center justify-between border-b border-n-border">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-n-text3 hover:text-white transition-colors text-xs uppercase tracking-wider"
        >
          ← back
        </button>

        <span className="nt-tag">phase 1b mcp slice</span>
      </header>

      <main className="flex-1 max-w-md w-full mx-auto px-4 py-5 space-y-4">
        <div className="bg-n-surface border border-n-border rounded-sm px-4 py-3 text-[11px] font-mono text-n-text2">
          {usingLocalProxy ? (
            <span>Transport: Vite proxy → local Deno run-mcp-action → fake MCP server</span>
          ) : (
            <span>Transport: Supabase Edge Function run-mcp-action</span>
          )}
        </div>

        <ManifestRenderer
          manifest={mcpToggleManifest}
          appData={appData}
          appId={mcpToggleManifest.app_id}
          onDataChange={handleDataChange}
        />
      </main>
    </div>
  );
}

