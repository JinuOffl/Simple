interface CardProps {
  title?: string;
  body?: string;
}

export function Card({ title, body }: CardProps) {
  return (
    <div className="bg-n-surface border border-n-border rounded-sm p-4 animate-fade-in">
      {title && (
        <p className="text-n-text3 text-[9px] uppercase tracking-[0.15em] mb-2">
          {title}
        </p>
      )}
      {body && (
        <p className="text-white text-xs leading-relaxed whitespace-pre-line">
          {body}
        </p>
      )}
    </div>
  );
}
