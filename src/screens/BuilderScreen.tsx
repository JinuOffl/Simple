import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAppStore } from "@/lib/zustandStore";
import { ManifestSchema } from "@/schema/manifest.schema";
import { ManifestRenderer } from "@/renderer/ManifestRenderer";

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
      const { data, error } = await supabase.functions.invoke("generate-manifest", {
        body: {
          user_prompt: userPrompt,
          existing_manifest: currentManifest ?? undefined,
          conversation_context: conversationContext,
        },
      });

      if (error) throw new Error(error.message);

      const parseResult = ManifestSchema.safeParse(data);
      if (!parseResult.success) {
        throw new Error(`Invalid manifest: ${parseResult.error.issues[0]?.message ?? "unknown"}`);
      }

      setManifest(parseResult.data);

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: currentManifest
          ? `Updated "${parseResult.data.name}". Check preview above.`
          : `Built "${parseResult.data.name}". Save it or ask me to change something.`,
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

  const handleSave = async () => {
    if (!currentManifest || isSaving) return;
    setIsSaving(true);
    const saved = await saveApp(currentManifest, editingAppId ?? undefined);
    if (saved) {
      setSaveSuccess(true);
      setTimeout(() => navigate("/"), 700);
    }
    setIsSaving(false);
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
    </div>
  );
}
