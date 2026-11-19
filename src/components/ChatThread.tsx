import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { formatActionError } from "@/lib/actionError";
import { ChatBubble } from "./ChatBubble";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatThreadProps {
  persona_prompt?: string;
  initial_message?: string;
  placeholder?: string;
  appId?: string;
}

/**
 * Multi-turn AI chat thread widget styled with Nothing-OS design tokens.
 * Persists local state across messages and communicates with runtime LLM edge functions.
 */
export function ChatThread({
  persona_prompt = "You are a helpful assistant.",
  initial_message,
  placeholder = "Write a message…",
  appId,
}: ChatThreadProps) {
  const [messages, setMessages] = useState<Message[]>(() =>
    initial_message
      ? [{ role: "assistant", content: initial_message }]
      : []
  );
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof scrollRef.current?.scrollTo === "function") {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    } else if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: "user", content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setIsLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("run-llm-action", {
        body: {
          action: {
            id: "chat_thread",
            kind: "conversation_loop",
            persona_prompt,
          },
          app_data: {},
          conversation_history: updated.slice(-12),
          app_id: appId,
        },
      });

      if (error) throw error;

      const reply = data?.result ?? "No response received.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      const msg = await formatActionError(
        e,
        "⚠️ Unable to get a response right now. Please try again."
      );
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: msg,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full bg-n-s1 border border-n-line rounded-sm overflow-hidden flex flex-col animate-fade-in">
      {/* Header bar */}
      <div className="px-4 py-2.5 border-b border-n-line bg-n-s2 flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-n-secondary">
          Assistant
        </span>
        <span className="nt-tag text-[8px] px-1.5 py-0.5 leading-none">
          {isLoading ? "typing…" : `${messages.length} messages`}
        </span>
      </div>

      {/* Messages viewport */}
      <div
        ref={scrollRef}
        className="p-3.5 space-y-2.5 overflow-y-auto"
        style={{ minHeight: "180px", maxHeight: "320px" }}
      >
        {messages.length === 0 && (
          <div className="py-8 text-center text-n-disabled text-xs">
            Start a conversation below.
          </div>
        )}

        {messages.map((m, idx) => (
          <ChatBubble key={idx} role={m.role} content={m.content} />
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bubble-assistant flex gap-1 py-2.5">
              <span className="loading-dot" />
              <span className="loading-dot" />
              <span className="loading-dot" />
            </div>
          </div>
        )}
      </div>

      {/* Input row */}
      <div className="p-2.5 border-t border-n-line flex gap-2 bg-n-s1">
        <input
          type="text"
          value={input}
          placeholder={placeholder}
          disabled={isLoading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          className="flex-1 bg-n-s2 border border-n-line px-3 py-2 text-xs text-n-primary placeholder:text-n-disabled outline-none rounded-sm focus:border-n-line3 transition-colors"
        />
        <button
          type="button"
          disabled={!input.trim() || isLoading}
          onClick={handleSend}
          className="px-3 py-2 bg-n-btn text-n-btn-text font-bold text-[10px] uppercase tracking-wider rounded-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-30 nt-press cursor-pointer"
        >
          Send
        </button>
      </div>
    </div>
  );
}
