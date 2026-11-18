import { useState } from "react";
import { saveConnection } from "@/lib/connectionsApi";
import { CATALOG_ADAPTERS } from "../../supabase/functions/_shared/catalog.ts";

export interface NeedsKeyCardProps {
  keyId: string;
  label: string;
  helpUrl?: string;
  serverUrl?: string;
  onSaved?: (keyId: string) => void;
}

export function NeedsKeyCard({
  keyId,
  label,
  helpUrl,
  serverUrl,
  onSaved,
}: NeedsKeyCardProps) {
  const [keyInput, setKeyInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Derive origin from catalog adapter if not provided
  const resolvedServerUrl = (() => {
    if (serverUrl) return serverUrl;
    const adapter = CATALOG_ADAPTERS.find((a) => a.keyId === keyId);
    if (adapter?.urlTemplate) {
      try {
        return new URL(adapter.urlTemplate).origin;
      } catch {
        // fallback
      }
    }
    return "https://api.simple.local";
  })();

  const handleSave = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed || isSaving) return;

    setIsSaving(true);
    setError(null);

    try {
      await saveConnection({
        connector_id: `key:${keyId}`,
        label,
        server_url: resolvedServerUrl,
        allowed_tools: [],
        token: trimmed,
      });

      setSavedSuccess(true);
      onSaved?.(keyId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      data-testid="needs-key-card"
      className="bg-n-surface border border-n-border hover:border-n-border2 rounded-sm p-3.5 space-y-2.5 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-[11px] font-mono uppercase tracking-wider text-white font-medium">
            API Key Required: {label}
          </p>
          <p className="text-[10px] text-n-text3 font-mono">
            Encrypted server-side in connection secrets. Never exposed to browser.
          </p>
        </div>

        {helpUrl && (
          <a
            href={helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Get ${label} key`}
            className="text-[10px] font-mono text-n-text3 hover:text-white underline shrink-0 transition-colors"
          >
            Get Key ↗
          </a>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          placeholder={`Enter ${label} key...`}
          disabled={isSaving || savedSuccess}
          aria-label={`${label} input`}
          className="flex-1 bg-n-bg border border-n-border px-3 py-1.5 text-xs text-white placeholder:text-n-text3 outline-none focus:border-n-border2 rounded-sm font-mono disabled:opacity-50"
        />

        <button
          type="button"
          onClick={handleSave}
          disabled={!keyInput.trim() || isSaving || savedSuccess}
          className={`px-3 py-1.5 text-[10px] uppercase font-mono font-bold tracking-wider rounded-sm transition-all shrink-0 ${
            savedSuccess
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
              : "bg-white text-n-bg hover:opacity-90 disabled:opacity-40"
          }`}
        >
          {savedSuccess ? "Saved ✓" : isSaving ? "..." : "Save Key"}
        </button>
      </div>

      {error && (
        <p className="text-[10px] font-mono text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
