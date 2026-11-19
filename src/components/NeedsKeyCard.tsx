import { useState } from "react";
import { Key } from "lucide-react";
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
      className="border-l-2 border-n-line3 bg-n-s1 p-4 space-y-3 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Key size={14} strokeWidth={1.5} className="text-n-secondary shrink-0" />
            <p className="font-grotesk text-sm text-n-primary font-medium">
              API Key Required: {label}
            </p>
          </div>
          <p className="font-grotesk text-xs text-n-secondary leading-relaxed">
            Encrypted server-side in connection secrets. Never exposed to browser.
          </p>
        </div>

        {helpUrl && (
          <a
            href={helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Get ${label} key`}
            className="nt-label hover:text-n-display shrink-0 transition-colors"
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
          className="flex-1 bg-n-s2 border border-n-line px-3 py-1.5 text-xs text-n-primary placeholder:text-n-disabled outline-none focus:border-n-line3 rounded-sm font-mono disabled:opacity-50 transition-colors"
        />

        <button
          type="button"
          onClick={handleSave}
          disabled={!keyInput.trim() || isSaving || savedSuccess}
          className={`px-3 py-1.5 text-[10px] uppercase font-mono font-bold tracking-widest rounded-sm border transition-all shrink-0 nt-press cursor-pointer ${
            savedSuccess
              ? "bg-n-s2 text-n-secondary border-n-line"
              : "bg-n-btn text-n-btn-text border-n-btn hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
          }`}
        >
          {savedSuccess ? "Saved ✓" : isSaving ? "..." : "Save Key"}
        </button>
      </div>

      {error && (
        <p className="font-grotesk text-xs text-n-red">
          {error}
        </p>
      )}
    </div>
  );
}
