import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAppStore } from "@/lib/zustandStore";
import { ManifestSchema, type Manifest } from "@/schema/manifest.v1";
import { ManifestV2Schema, type ManifestV2 } from "@/schema/manifest.v2";
import { ManifestRenderer } from "@/renderer/ManifestRenderer";
import { isHighRiskMcpTool } from "@/actions/mcpAction";
import { getManifestConsentSummary } from "@/lib/manifestConsent";

interface ChatMessage { role: "user" | "assistant"; content: string; }

export function BuilderScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefillPrompt = (location.state as { prefillPrompt?: string })?.prefillPrompt ?? "";

  const {
    currentManifest, conversationContext, isGenerating,
    generationError, editingAppId,
    setManifest, setGenerating, setGenerationError,
    addMessage, resetBuilder, saveApp,
  } = useAppStore();

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [inputText, setInputText]     = useState(prefillPrompt);
  const [isSaving, setIsSaving]       = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef      = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chatHistory, isGenerating]);

  useEffect(() => {
    if (prefillPrompt) {
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
    setGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-app", {
        body: {
          user_prompt: userPrompt,
          existing_manifest: currentManifest ?? undefined,
          conversation_context: conversationContext,
        },
      });

      if (error) {
        let detailedMessage = error.message;
        const contextResponse = (error as { context?: { json?: () => Promise<unknown> } }).context;
        if (contextResponse && typeof contextResponse.json === "function") {
          try {
            const payload = (await contextResponse.json()) as {
              unsupported?: { message?: string; alternative?: string };
              error?: string;
            };
            if (payload?.unsupported?.message) {
              detailedMessage = payload.unsupported.alternative
                ? `${payload.unsupported.message} ${payload.unsupported.alternative}`
                : payload.unsupported.message;
            } else if (payload?.error) {
              detailedMessage = payload.error;
            }
          } catch {
            // Keep original invoke error message when response body is non-JSON
          }
        }
        throw new Error(detailedMessage);
      }

      const responseRecord =
        typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;

      if (responseRecord && responseRecord.ok === false) {
        const unsupported = responseRecord.unsupported as
          | { message?: string; alternative?: string }
          | undefined;
        if (unsupported?.message) {
          const full = unsupported.alternative
            ? `${unsupported.message} ${unsupported.alternative}`
            : unsupported.message;
          throw new Error(full);
        }
        throw new Error(
          typeof responseRecord.error === "string"
            ? responseRecord.error
            : "Failed to generate app manifest."
        );
      }

      const candidatePayload =
        responseRecord && "manifest" in responseRecord ? responseRecord.manifest : data;

      // Try v2 first; fall back to v1 if an older response shape arrives
      const v2Parse = ManifestV2Schema.safeParse(candidatePayload);
      let parsedManifest: Manifest | ManifestV2;

      if (v2Parse.success) {
        parsedManifest = v2Parse.data;
      } else {
        const v1Parse = ManifestSchema.safeParse(candidatePayload);
        if (!v1Parse.success) {
          const isV2Candidate =
            typeof candidatePayload === "object" &&
            candidatePayload !== null &&
            "schema_version" in candidatePayload &&
            (candidatePayload as Record<string, unknown>).schema_version === 2;
          const issues = isV2Candidate ? v2Parse.error.issues : v1Parse.error.issues;
          throw new Error(`Invalid manifest: ${issues[0]?.message ?? "unknown"}`);
        }
        parsedManifest = v1Parse.data;
      }

      setManifest(parsedManifest);

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: currentManifest
          ? `Updated "${parsedManifest.name}". Check preview above.`
          : `Built "${parsedManifest.name}". Save it or ask me to change something.`,
      };
      setChatHistory(prev => [...prev, assistantMsg]);
      addMessage("assistant", assistantMsg.content);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      setGenerationError(msg);
      setChatHistory(prev => [
        ...prev,
        { role: "assistant", content: `Error: ${msg}. Try rephrasing.` },
      ]);
    } finally {
      setGenerating(false);
      inputRef.current?.focus();
    }
  };

  const consentSummary = currentManifest ? getManifestConsentSummary(currentManifest) : null;

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
    <div className="min-h-screen flex flex-col bg-gradient-mesh">

      {/* Header */}
      <header className="px-4 pt-5 pb-3 flex items-center gap-3 border-b border-n-border">
        <button
          onClick={() => { resetBuilder(); navigate("/"); }}
          className="text-n-text3 hover:text-white text-[11px] uppercase tracking-wider transition-colors"
        >
          ← back
        </button>

        <div className="flex-1">
          <p className="text-n-text2 text-[11px] uppercase tracking-wider">
            {editingAppId
              ? `editing · ${currentManifest?.name ?? "app"}`
              : "new app"}
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

      {/* Canvas — top 50vh */}
      <div
        className="overflow-y-auto border-b border-n-border"
        style={{ flex: "0 0 50vh" }}
      >
        {currentManifest ? (
          <ManifestRenderer manifest={currentManifest} isPreview={true} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-3 p-8">
            {isGenerating ? (
              /* Dot-matrix generating animation */
              <div className="flex flex-col items-center gap-4">
                <p
                  className="font-doto text-n-text3 tracking-widest animate-pulse-slow"
                  style={{ fontSize: "18px", fontVariationSettings: "'ROND' 0" }}
                >
                  GENERATING
                </p>
                <div className="flex gap-1.5">
                  <span className="loading-dot" />
                  <span className="loading-dot" />
                  <span className="loading-dot" />
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
                  canvas · describe your app below
                </p>
              </>
            )}
          </div>
        )}
      </div>

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

        {generationError && (
          <div className="mx-4 mb-2 px-3 py-2 border border-n-border bg-n-surface">
            <p className="text-[10px]" style={{ color: "rgba(255,100,100,0.7)" }}>
              {generationError}
            </p>
          </div>
        )}

        {/* Input bar */}
        <div className="px-4 py-3 border-t border-n-border flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder={currentManifest ? "change x / add y..." : "describe your app..."}
            disabled={isGenerating}
            className="flex-1 bg-n-surface border border-n-border px-4 py-3
                       text-xs text-white placeholder:text-n-text3 outline-none
                       focus:border-n-border2 transition-colors disabled:opacity-40
                       rounded-sm"
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputText.trim() || isGenerating}
            id="builder-send-button"
            className="w-11 h-11 bg-white flex items-center justify-center
                       transition-all duration-150 active:scale-90
                       disabled:opacity-30 flex-shrink-0 rounded-sm"
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
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-consent-title"
        >
          <div className="w-full max-w-md bg-n-surface border border-n-border rounded-card p-5 space-y-4 shadow-xl">
            <div className="space-y-1">
              <h2
                id="save-consent-title"
                className="font-mono text-sm font-semibold tracking-wide text-n-text uppercase"
              >
                Review App Capabilities Before Saving
              </h2>
              <p className="text-xs text-n-muted leading-relaxed">
                <span className="text-n-text font-medium">{currentManifest.name}</span> requests
                access to the capabilities below. External connectors run strictly using your own
                saved account tokens.
              </p>
            </div>

            {consentSummary.permissions.length > 0 && (
              <div className="space-y-1.5">
                <div className="font-mono text-[11px] uppercase tracking-wider text-n-muted">
                  Device Permissions
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {consentSummary.permissions.map((perm) => (
                    <span
                      key={perm}
                      className="px-2.5 py-0.5 rounded-pill border border-n-border bg-n-bg font-mono text-xs text-n-text"
                    >
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {consentSummary.connectors.length > 0 && (
              <div className="space-y-2">
                <div className="font-mono text-[11px] uppercase tracking-wider text-n-muted">
                  MCP Connectors & Tools
                </div>
                <div className="space-y-2">
                  {consentSummary.connectors.map((connector) => (
                    <div
                      key={connector.connectorId}
                      className="rounded-lg border border-n-border bg-n-bg p-3 space-y-1.5"
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
                                className="flex items-center justify-between gap-2 font-mono text-xs text-n-muted"
                              >
                                <span className="text-n-text">{tool}</span>
                                {highRisk && (
                                  <span className="px-2 py-0.5 rounded-pill border border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300 uppercase">
                                    High Risk · Extra Confirm
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <div className="font-mono text-[11px] text-n-muted">
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
                <div className="font-mono text-[11px] uppercase tracking-wider text-n-muted">
                  External APIs
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {consentSummary.apis.map((apiName) => (
                    <span
                      key={apiName}
                      className="px-2.5 py-0.5 rounded-pill border border-n-border bg-n-bg font-mono text-xs text-n-text"
                    >
                      {apiName}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {consentSummary.hasHighRiskTools && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 leading-relaxed">
                This app includes high-risk external actions. Running those tools will require an
                extra confirmation tap each time.
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-n-border">
              <button
                type="button"
                onClick={() => setShowConsentModal(false)}
                className="px-3.5 py-2 rounded-pill border border-n-border text-xs font-mono text-n-muted hover:text-n-text transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-pill bg-n-accent text-white text-xs font-mono font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
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
