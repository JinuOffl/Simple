interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
}

export function ChatBubble({ role, content }: ChatBubbleProps) {
  const isUser = role === "user";

  return (
    <div
      className={`flex items-end gap-2 animate-slide-up ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-sm bg-n-surface2 border border-n-border2 flex items-center justify-center flex-shrink-0 mb-1">
          <span className="text-xs">✨</span>
        </div>
      )}

      <div className={isUser ? "bubble-user" : "bubble-assistant"}>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}
