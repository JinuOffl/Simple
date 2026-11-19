import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppStore } from "@/lib/zustandStore";
import { isLocalGuestSession } from "@/lib/guestAuth";
import { mapBuilderErrorMessage } from "@/lib/builderError";
import { ManifestRenderer } from "@/renderer/ManifestRenderer";
import { isHighRiskMcpTool } from "@/actions/mcpAction";
import { getManifestConsentSummary } from "@/lib/manifestConsent";
import { generateAppWithFallback, GenerationClientError } from "@/lib/generationClient";
import { getGenerationLog } from "@/lib/generationLog";
import { getToolStatus } from "@/lib/toolStatus";
import { listConnections } from "@/lib/connectionsApi";
import { NeedsKeyCard } from "@/components/NeedsKeyCard";

const PREVIEW_SIZE_CLASSES: Record<string, string> = {
  "1x1": "max-w-[220px]",
  "2x1": "max-w-[360px]",
  "2x2": "max-w-[360px]",
  "4x2": "max-w-[560px]",
};

interface ChatMessage { role: "user" | "assistant"; content: string; }

export function BuilderScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefillPrompt = (location.state as { prefillPrompt?: string })?.prefillPrompt ?? "";

  const {
    currentManifest, conversationContext, isGenerating,
    generationError, editingAppId, session,
    setManifest, setGenerating, setGenerationError,
    addMessage, resetBuilder, saveApp,
  } = useAppStore();

  const isLocalGuest = isLocalGuestSession(session);

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [inputText, setInputText]     = useState(prefillPrompt);
  const [isSaving, setIsSaving]       = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [savedKeyIds, setSavedKeyIds] = useState<Set<string>>(new Set());
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef      = useRef<HTMLInputElement>(null);
  const prefillSent   = useRef(false);
  const previousConsentFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (showConsentModal) {
      previousConsentFocusRef.current = document.activeElement as HTMLElement | null;
    } else if (previousConsentFocusRef.current) {
      previousConsentFocusRef.current.focus?.();
      previousConsentFocusRef.current = null;
    }
  }, [showConsentModal]);

  useEffect(() => {
    let isMounted = true;
    listConnections()
      .then((connections) => {
        if (!isMounted) return;
        const ids = new Set<string>();
        for (const c of connections) {
          if (c.connector_id?.startsWith("key:") && c.has_token) {
            ids.add(c.connector_id.replace(/^key:/, ""));
          }
        }
        setSavedKeyIds(ids);
      })
      .catch(() => {
        // Guest mode or offline: keep empty
      });
    return () => {
      isMounted = false;
    };
  }, [currentManifest]);

  useEffect(() => {
    if (typeof chatScrollRef.current?.scrollTo === "function") {
      chatScrollRef.current.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [chatHistory, isGenerating]);

  useEffect(() => {
    if (prefillPrompt && !prefillSent.current) {
      prefillSent.current = true;
      handleSend(prefillPrompt);
      setInputText("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async (text?: string) => {
    const userPrompt = (text ?? inputText).trim();
    if (!userPrompt || isGenerating) return;

    setInputText("");
    setGenerationError(null);

    const userMsg: ChatMessage = { role: "user", content: userPrompt };
    setChatHistory(prev => [...prev, userMsg]);
    addMessage("user", userPrompt);

    if (isLocalGuest) {
      const offlineMsg = "Guest mode is offline. Sign in with email to build tools.";
      setGenerationError(offlineMsg);
      setChatHistory(prev => [
        ...prev,
        { role: "assistant", content: offlineMsg },
      ]);
      return;
    }

    setGenerating(true);

    try {
      const result = await generateAppWithFallback({
        userPrompt,
        existingManifest: currentManifest ?? undefined,
        conversationContext,
      });

      if (!result.ok || !result.manifest) {
        if (result.unsupported?.message) {
          const full = result.unsupported.alternative
            ? `${result.unsupported.message} ${result.unsupported.alternative}`
            : result.unsupported.message;
          throw new GenerationClientError(full, result.status, result.code);
        }
        throw new GenerationClientError(
          result.error ?? "Failed to generate tool manifest.",
          result.status,
          result.code
        );
      }

      const parsedManifest = result.manifest;
      setManifest(parsedManifest);

      const patchSummary =
        Array.isArray(result.patch) && result.patch.length > 0
          ? result.patch.map((op: any) => `${op.op} ${op.path}`).join("; ")
          : "";

      if (result.usedTemplateFallback) {
        const fallbackText = `AI is unreachable - loaded the closest starter template: ${
          result.templateName ?? parsedManifest.name
        }`;
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: fallbackText,
        };
        setChatHistory((prev) => [...prev, assistantMsg]);
        addMessage("assistant", assistantMsg.content);
      } else {
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: currentManifest
            ? `Updated "${parsedManifest.name}". ${patchSummary || "Applied changes."}`
            : `Built "${parsedManifest.name}". Save it or ask me to change something.`,
        };
        setChatHistory((prev) => [...prev, assistantMsg]);
        addMessage("assistant", assistantMsg.content);
      }
    } catch (e) {
      const friendly = mapBuilderErrorMessage(e instanceof Error ? e : String(e));
      setGenerationError(friendly);
      setChatHistory(prev => [
        ...prev,
        { role: "assistant", content: friendly },
      ]);
    } finally {
      setGenerating(false);
      inputRef.current?.focus();
    }
  };

  const consentSummary = currentManifest ? getManifestConsentSummary(currentManifest) : null;
  const toolRequires =
    currentManifest && "tool" in currentManifest && Array.isArray(currentManifest.tool?.requires)
      ? currentManifest.tool.requires
      : [];
  const missingKeys = toolRequires.filter((r) => !savedKeyIds.has(r.key_id));
  const missingKeyIds = missingKeys.map((r) => r.key_id);

  const performSave = async () => {
    if (!currentManifest || isSaving) return;
    setShowConsentModal(false);
    setIsSaving(true);
    const saved = await saveApp(currentManifest, editingAppId ?? undefined);
    if (saved) {
      setSaveSuccess(true);
      setTimeout(() => navigate("/"), 700);
    }
    setIsSaving(false);
  };

  const handleSave = async () => {
    if (!currentManifest || isSaving) return;
    if (consentSummary?.requiresConsent) {
      setShowConsentModal(true);
      return;
    }
    await performSave();
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-mesh">

      {/* Header */}
      <header className="px-4 pt-5 pb-3 flex items-center gap-3 border-b border-n-border">
        <button
          onClick={() => { resetBuilder(); navigate("/"); }}
          aria-label="Back to home"
          className="text-n-text3 hover:text-white text-[11px] uppercase tracking-wider transition-colors"
        >
          ← back
        </button>

        <button
          onClick={() => resetBuilder()}
          className="px-2 py-0.5 text-[10px] uppercase tracking-wider text-n-text3 hover:text-white border border-n-border rounded-sm transition-colors"
        >
          NEW
        </button>

        <div className="flex-1">
          <p className="text-n-text2 text-[11px] uppercase tracking-wider">
            {editingAppId
              ? `editing · ${currentManifest?.name ?? "tool"}`
              : "new tool"}
          </p>
        </div>

        {currentManifest && (
          <button
            onClick={handleSave}
            disabled={isSaving || saveSuccess}
            className={`px-4 py-1.5 text-[10px] uppercase tracking-widest font-bold
                        border rounded-sm transition-all duration-150
                        ${saveSuccess
                          ? "border-white/30 text-white"
                          : "bg-white text-n-bg border-white hover:opacity-80"
                        }
                        disabled:opacity-40`}
          >
            {saveSuccess ? "SAVED ✓" : isSaving ? "..." : editingAppId ? "UPDATE" : "SAVE"}
          </button>
        )}
      </header>

      {/* Canvas / Preview tile container */}
      <div
        className="overflow-y-auto border-b border-n-border p-4 flex items-center justify-center bg-n-bg/30"
        style={{ flex: "0 0 40dvh" }}
      >
        {currentManifest ? (
          <div
            className={`w-full ${PREVIEW_SIZE_CLASSES[("tool" in currentManifest ? currentManifest.tool?.size : undefined) ?? "2x1"] ?? "max-w-[360px]"} transition-all duration-200`}
          >
            <div className="border border-n-border bg-n-surface rounded-sm overflow-hidden shadow-lg">
              <ManifestRenderer manifest={currentManifest} isPreview={true} />
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-3 p-8">
            {isGenerating ? (
              <div
                data-testid="builder-skeleton"
                className="w-full max-w-[340px] bg-n-surface border border-n-border rounded-sm p-4 space-y-3"
              >
                <div className="flex items-center justify-between pb-2 border-b border-n-border">
                  <div className="skeleton w-20 h-3 rounded-sm" />
                  <div className="skeleton w-8 h-3 rounded-sm" />
                </div>
                <div className="skeleton w-full h-24 rounded-sm" />
                <div className="flex gap-2 pt-1">
                  <div className="skeleton flex-1 h-8 rounded-sm" />
                  <div className="skeleton w-16 h-8 rounded-sm" />
                </div>
                <div className="text-center pt-2">
                  <span
                    className="font-doto text-n-text3 text-[11px] tracking-widest uppercase animate-pulse-slow"
                    style={{ fontVariationSettings: "'ROND' 0" }}
                  >
                    GENERATING TOOL ···
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 border border-n-border flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-n-text3" fill="none" stroke="currentColor" strokeWidth={1}>
                    <rect x="3" y="3" width="18" height="18" rx="1" />
                    <path d="M3 9h18M9 21V9" />
                  </svg>
                </div>
                <p className="text-n-text3 text-[10px] uppercase tracking-wider text-center">
                  canvas · describe your tool below
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Hairline status row */}
      <div className="px-4 py-2 border-b border-n-border flex items-center justify-between text-[11px] font-mono text-n-text2 bg-n-surface/40">
        <span className="text-n-text3 uppercase tracking-wider text-[10px]">Status</span>
        <span className="text-white font-medium" data-testid="tool-status">
          {getToolStatus(currentManifest, { keysMissing: missingKeyIds })}
        </span>
      </div>

      {/* Missing API keys banner/cards */}
      {missingKeys.length > 0 && (
        <div className="px-4 py-2 space-y-2 border-b border-n-border bg-n-surface/20" data-testid="missing-keys-container">
          {missingKeys.map((req) => (
            <NeedsKeyCard
              key={req.key_id}
              keyId={req.key_id}
              label={req.label}
              helpUrl={req.help_url}
              onSaved={(savedKeyId) => {
                setSavedKeyIds((prev) => new Set([...prev, savedKeyId]));
              }}
            />
          ))}
        </div>
      )}

      {/* Chat pane */}
      <div className="flex flex-col" style={{ flex: 1 }}>
        <div
          ref={chatScrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5"
          style={{ maxHeight: "28vh" }}
        >
          {chatHistory.length === 0 && (
            <p className="text-n-text3 text-[10px] uppercase tracking-wider text-center py-3">
              describe what you want to build
            </p>
          )}

          {chatHistory.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={msg.role === "user" ? "bubble-user" : "bubble-assistant"}>
                {msg.content}
              </div>
            </div>
          ))}

          {isGenerating && !currentManifest && (
            <div className="flex justify-start">
              <div className="bubble-assistant flex gap-1 py-3">
                <span className="loading-dot" />
                <span className="loading-dot" />
                <span className="loading-dot" />
              </div>
            </div>
          )}
        </div>

        {isLocalGuest && (
          <div
            data-testid="offline-guest-notice"
            className="mx-4 mb-2 bg-n-surface border border-white/40 rounded-sm px-4 py-3 flex items-center justify-between gap-3 text-xs animate-slide-up"
          >
            <span className="text-white">
              Guest mode is offline. Sign in with email to build tools.
            </span>
            <button
              type="button"
              onClick={() => navigate("/auth")}
              className="text-[10px] font-mono uppercase tracking-wider text-white border border-n-border px-2 py-1 rounded-sm hover:border-white transition-colors cursor-pointer shrink-0"
            >
              SIGN IN →
            </button>
          </div>
        )}

        {generationError && (
          <div className="mx-4 mb-2 px-3 py-2 border border-n-border bg-n-surface flex items-center justify-between gap-2 animate-slide-up">
            <p className="text-[10px] text-red-400 flex-1 leading-relaxed font-mono">
              {generationError}
            </p>
            <button
              type="button"
              onClick={() => setGenerationError(null)}
              aria-label="Dismiss error"
              className="text-n-text3 hover:text-white text-xs px-1.5 py-0.5 shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {import.meta.env.DEV && (
          <details className="mx-4 mb-2 border border-n-border bg-n-surface text-[10px] text-n-text3 rounded-sm">
            <summary className="px-3 py-1.5 cursor-pointer font-mono select-none uppercase tracking-wider text-n-text2 hover:text-white">
              LLM TRACE ({getGenerationLog().length})
            </summary>
            <div className="p-3 max-h-40 overflow-y-auto space-y-2 font-mono">
              {getGenerationLog().length === 0 ? (
                <p className="text-n-text3">No generation logs recorded.</p>
              ) : (
                getGenerationLog().map((entry, idx) => (
                  <div key={idx} className="border-b border-n-border/50 pb-1.5 last:border-none">
                    <div className="flex justify-between text-n-text2">
                      <span>[{entry.tier ?? "unknown"}] {entry.ok ? "✓ OK" : "✗ FAILED"}</span>
                      <span>{entry.latencyMs}ms · {new Date(entry.time).toLocaleTimeString()}</span>
                    </div>
                    <div className="truncate text-white/80">"{entry.userPrompt}"</div>
                    <div className="text-n-text3">
                      manifest: {entry.existingManifestBytes} bytes
                      {entry.repairAttempts !== undefined && ` · repairs: ${entry.repairAttempts}`}
                    </div>
                    {entry.error && <div className="text-red-400">Error: {entry.error}</div>}
                    {entry.validationErrors && entry.validationErrors.length > 0 && (
                      <div className="text-amber-400">Validation: {entry.validationErrors.join(", ")}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </details>
        )}

        {/* Input bar */}
        <div className="sticky bottom-0 bg-n-bg px-4 py-3 border-t border-n-border flex gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={isLocalGuest ? "Sign in with email to build tools" : "describe the tool"}
            disabled={isGenerating || isLocalGuest}
            aria-label="Tool prompt input"
            className="flex-1 bg-n-surface border border-n-border px-5 py-3
                       text-xs text-white placeholder:text-n-text3 outline-none
                       focus:border-n-border2 transition-colors disabled:opacity-40
                       rounded-full"
          />
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!inputText.trim() || isGenerating || isLocalGuest}
            id="builder-send-button"
            aria-label="Send message"
            className="w-11 h-11 bg-white flex items-center justify-center
                       transition-all duration-150 active:scale-90
                       disabled:opacity-30 flex-shrink-0 rounded-full"
          >
            {isGenerating ? (
              <div className="w-3 h-3 border border-n-bg border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="#0a0a0a" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {showConsentModal && consentSummary && currentManifest && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-consent-title"
        >
          <div className="w-full max-w-md bg-n-surface border border-n-border rounded-sm p-5 space-y-4 shadow-xl">
            <div className="space-y-1">
              <h2
                id="save-consent-title"
                className="font-mono text-sm font-semibold tracking-wide text-n-text uppercase"
              >
                Review Tool Capabilities Before Saving
              </h2>
              <p className="text-xs text-n-text2 leading-relaxed">
                <span className="text-n-text font-medium">{currentManifest.name}</span> requests
                access to the capabilities below. External connectors run strictly using your own
                saved account tokens.
              </p>
            </div>

            {consentSummary.permissions.length > 0 && (
              <div className="space-y-1.5">
                <div className="font-mono text-[11px] uppercase tracking-wider text-n-text2">
                  Device Permissions
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {consentSummary.permissions.map((perm) => (
                    <span
                      key={perm}
                      className="px-2.5 py-0.5 rounded-sm border border-n-border bg-n-bg font-mono text-xs text-n-text"
                    >
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {consentSummary.connectors.length > 0 && (
              <div className="space-y-2">
                <div className="font-mono text-[11px] uppercase tracking-wider text-n-text2">
                  MCP Connectors & Tools
                </div>
                <div className="space-y-2">
                  {consentSummary.connectors.map((connector) => (
                    <div
                      key={connector.connectorId}
                      className="rounded-sm border border-n-border bg-n-bg p-3 space-y-1.5"
                    >
                      <div className="font-mono text-xs font-semibold text-n-text">
                        {connector.connectorId}
                      </div>
                      {connector.tools.length > 0 ? (
                        <ul className="space-y-1">
                          {connector.tools.map((tool) => {
                            const highRisk = isHighRiskMcpTool(tool);
                            return (
                              <li
                                key={tool}
                                className="flex items-center justify-between gap-2 font-mono text-xs text-n-text2"
                              >
                                <span className="text-n-text">{tool}</span>
                                {highRisk && (
                                  <span className="px-2 py-0.5 rounded-sm border border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300 uppercase">
                                    High Risk · Extra Confirm
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <div className="font-mono text-[11px] text-n-text2">
                          No specific tools declared
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {consentSummary.apis.length > 0 && (
              <div className="space-y-1.5">
                <div className="font-mono text-[11px] uppercase tracking-wider text-n-text2">
                  External APIs
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {consentSummary.apis.map((apiName) => (
                    <span
                      key={apiName}
                      className="px-2.5 py-0.5 rounded-sm border border-n-border bg-n-bg font-mono text-xs text-n-text"
                    >
                      {apiName}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {consentSummary.hasHighRiskTools && (
              <p className="rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 leading-relaxed font-mono">
                This tool includes high-risk external actions. Running those tools will require an
                extra confirmation tap each time.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-n-border">
              <button
                type="button"
                onClick={() => setShowConsentModal(false)}
                className="px-3.5 py-2 rounded-sm border border-n-border text-xs font-mono text-n-text2 hover:text-n-text transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-sm bg-white text-n-bg text-xs font-mono font-bold uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Approve & Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
