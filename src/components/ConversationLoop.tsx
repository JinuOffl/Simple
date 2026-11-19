import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ChatBubble } from "./ChatBubble";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ConversationLoopProps {
  persona_prompt: string;
  actionId: string;
  appId?: string;
}

// Extend Window for vendor-prefixed SpeechRecognition
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition?: any;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any;

export function ConversationLoop({ persona_prompt, appId }: ConversationLoopProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SR | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setInputText("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("run-llm-action", {
        body: {
          action: {
            id: "conversation",
            kind: "conversation_loop",
            persona_prompt,
          },
          app_data: {},
          conversation_history: updatedHistory,
          app_id: appId,
        },
      });

      if (error) throw error;

      const assistantMsg: Message = {
        role: "assistant",
        content: data.result ?? "I couldn't generate a response. Please try again.",
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Something went wrong. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const startVoiceInput = () => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (e: { results: SpeechRecognitionResultList }) => {
      const transcript = Array.from(e.results)
        .map((r: SpeechRecognitionResult) => r[0].transcript)
        .join(" ");
      sendMessage(transcript);
    };

    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => setIsRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  return (
    <div className="bg-n-surface border border-n-border rounded-sm overflow-hidden flex flex-col animate-fade-in" style={{ minHeight: "300px" }}>
      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: "300px" }}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <span className="text-3xl">💬</span>
            <p className="text-n-text3 text-xs font-mono uppercase tracking-wider text-center">
              Start a conversation — type or use the mic
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatBubble key={i} role={msg.role} content={msg.content} />
        ))}
        {isLoading && (
          <div className="flex items-end gap-2">
            <div className="w-7 h-7 rounded-sm bg-n-surface2 border border-n-border2 flex items-center justify-center flex-shrink-0">
              <span className="text-xs">✨</span>
            </div>
            <div className="bubble-assistant">
              <div className="flex gap-1 items-center py-0.5">
                <span className="loading-dot" />
                <span className="loading-dot" />
                <span className="loading-dot" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-n-border p-3 flex gap-2">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage(inputText)}
          placeholder="Type a message…"
          className="flex-1 bg-black/40 border border-n-border rounded-sm px-3.5 py-2
                     text-xs text-white placeholder:text-n-text3 outline-none
                     focus:border-white transition-colors font-mono"
        />

        {/* Mic button */}
        <button
          type="button"
          onClick={startVoiceInput}
          disabled={isLoading}
          aria-label={isRecording ? "Stop voice input" : "Start voice input"}
          className={`
            w-9 h-9 rounded-sm border flex items-center justify-center transition-colors active:scale-95
            ${isRecording
              ? "bg-white text-black border-white animate-pulse"
              : "bg-transparent border-n-border hover:border-white text-white"
            }
          `}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2H3v2a9 9 0 008 8.94V23h2v-2.06A9 9 0 0021 12v-2h-2z" />
          </svg>
        </button>

        {/* Send button */}
        <button
          type="button"
          onClick={() => sendMessage(inputText)}
          disabled={!inputText.trim() || isLoading}
          aria-label="Send message"
          className="w-9 h-9 bg-white text-black hover:bg-neutral-200
                     rounded-sm flex items-center justify-center transition-colors
                     active:scale-95 disabled:opacity-30"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
