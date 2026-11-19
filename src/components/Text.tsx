interface TextProps {
  content: string;
  className?: string;
}

export function Text({ content, className = "" }: TextProps) {
  return (
    <p
      className={`text-n-primary font-grotesk text-sm leading-relaxed whitespace-pre-wrap ${className}`}
    >
      {content}
    </p>
  );
}
