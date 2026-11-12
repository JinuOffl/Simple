import React from "react";

interface MarkdownProps {
  content?: string;
  className?: string;
}

/**
 * Safely parses and renders a subset of CommonMark (headings, lists, bold, italic, code, quotes, links)
 * with strict XSS sanitization (no dangerouslySetInnerHTML, pure React VDOM).
 */
export function Markdown({ content = "", className = "" }: MarkdownProps) {
  if (!content) {
    return null;
  }

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let inList = false;
  let listItems: string[] = [];
  let isOrderedList = false;

  const flushList = () => {
    if (!inList) return;
    const ListTag = isOrderedList ? "ol" : "ul";
    const currentItems = [...listItems];
    const key = `list-${elements.length}`;
    elements.push(
      <ListTag
        key={key}
        className={`my-2 space-y-1 pl-5 text-xs text-n-text2 ${
          isOrderedList ? "list-decimal font-mono" : "list-disc"
        }`}
      >
        {currentItems.map((item, idx) => (
          <li key={idx} className="leading-relaxed">
            {renderInlineMarkdown(item)}
          </li>
        ))}
      </ListTag>
    );
    listItems = [];
    inList = false;
  };

  const flushCodeBlock = () => {
    if (!inCodeBlock) return;
    const code = codeBlockContent.join("\n");
    const key = `code-${elements.length}`;
    elements.push(
      <pre
        key={key}
        className="my-2.5 overflow-x-auto rounded-sm border border-n-border bg-[#050505] p-3 font-mono text-[11px] text-white/90"
      >
        <code>{code}</code>
      </pre>
    );
    codeBlockContent = [];
    inCodeBlock = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    // Code block toggle
    if (rawLine.trim().startsWith("```")) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(rawLine);
      continue;
    }

    const trimmed = rawLine.trim();

    // Empty lines
    if (!trimmed) {
      flushList();
      continue;
    }

    // Unordered list item
    const ulMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (ulMatch) {
      if (inList && isOrderedList) flushList();
      inList = true;
      isOrderedList = false;
      listItems.push(ulMatch[1]);
      continue;
    }

    // Ordered list item
    const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (inList && !isOrderedList) flushList();
      inList = true;
      isOrderedList = true;
      listItems.push(olMatch[1]);
      continue;
    }

    // Not a list item
    flushList();

    // Headings
    if (trimmed.startsWith("# ")) {
      elements.push(
        <h1
          key={`h1-${i}`}
          className="mt-3 mb-1.5 font-mono text-base font-semibold tracking-wide text-white uppercase"
        >
          {renderInlineMarkdown(trimmed.slice(2))}
        </h1>
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h2
          key={`h2-${i}`}
          className="mt-2.5 mb-1 font-mono text-sm font-semibold tracking-wide text-white"
        >
          {renderInlineMarkdown(trimmed.slice(3))}
        </h2>
      );
      continue;
    }
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h3
          key={`h3-${i}`}
          className="mt-2 mb-1 text-xs font-semibold uppercase tracking-wider text-n-text2"
        >
          {renderInlineMarkdown(trimmed.slice(4))}
        </h3>
      );
      continue;
    }

    // Blockquote
    if (trimmed.startsWith("> ")) {
      elements.push(
        <blockquote
          key={`quote-${i}`}
          className="my-2 border-l-2 border-white/30 pl-3 text-xs italic text-n-text3"
        >
          {renderInlineMarkdown(trimmed.slice(2))}
        </blockquote>
      );
      continue;
    }

    // Standard paragraph
    elements.push(
      <p key={`p-${i}`} className="my-1 text-xs leading-relaxed text-white/90">
        {renderInlineMarkdown(trimmed)}
      </p>
    );
  }

  flushList();
  flushCodeBlock();

  return (
    <div className={`space-y-1 text-xs text-white ${className}`}>
      {elements}
    </div>
  );
}

/**
 * Safely parse bold, italic, code spans, and links into React elements.
 */
function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Tokenize bold (**...**), inline code (`...`), links ([...](...)), and italics (*...*)
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={match.index} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={match.index}
          className="rounded-sm bg-n-surface px-1 py-0.5 font-mono text-[11px] text-white/90"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("[") && token.includes("](") && token.endsWith(")")) {
      const splitIdx = token.indexOf("](");
      const linkText = token.slice(1, splitIdx);
      const href = token.slice(splitIdx + 2, -1);
      const isSafe = /^https?:\/\//i.test(href) || href.startsWith("mailto:");
      parts.push(
        isSafe ? (
          <a
            key={match.index}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white underline hover:opacity-80"
          >
            {linkText}
          </a>
        ) : (
          <span key={match.index}>{linkText}</span>
        )
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <em key={match.index} className="italic text-white/80">
          {token.slice(1, -1)}
        </em>
      );
    } else {
      parts.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
