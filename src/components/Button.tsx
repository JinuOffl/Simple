interface ButtonProps {
  label: string;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}

export function Button({ label, onClick, loading = false, disabled = false, variant = "primary" }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={variant === "primary" ? "btn-primary" : "btn-ghost"}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-1.5">
          <span className="loading-dot" />
          <span className="loading-dot" />
          <span className="loading-dot" />
        </span>
      ) : (
        label.toUpperCase()
      )}
    </button>
  );
}
