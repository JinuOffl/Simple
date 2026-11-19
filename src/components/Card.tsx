interface CardProps {
  title?: string;
  body?: string;
}

export function Card({ title, body }: CardProps) {
  return (
    <div className="bg-n-s1 border border-n-line rounded-sm p-4 animate-fade-in">
      {title && (
        <p className="nt-label mb-2">
          {title}
        </p>
      )}
      {body && (
        <p className="text-n-primary font-grotesk text-xs leading-relaxed whitespace-pre-line">
          {body}
        </p>
      )}
    </div>
  );
}
