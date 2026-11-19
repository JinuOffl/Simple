/**
 * Error message mapping for builder screen.
 * Maps raw server errors/status codes to user-friendly copy and hides internal details in production.
 */
export interface BuilderErrorLike {
  message?: string;
  status?: number;
  code?: string;
}

/**
 * Error message mapping for builder screen.
 * Maps raw server errors/status codes to user-friendly copy and hides internal details in production.
 * Checks HTTP status or code field, not fragile substrings (e.g. "credit" must not match credit_cost_class).
 */
export function mapBuilderErrorMessage(
  raw: string | Error | BuilderErrorLike,
  isDev: boolean = import.meta.env.DEV
): string {
  let message = "";
  let status: number | undefined;
  let code: string | undefined;

  if (typeof raw === "string") {
    message = raw;
    const statusMatch = /(?:^|\b)(401|402|403|424|429|500|503)(?:\b|:)/.exec(raw);
    if (statusMatch) {
      status = parseInt(statusMatch[1], 10);
    }
  } else if (raw instanceof Error) {
    message = raw.message;
    const withStatus = raw as { status?: number; code?: string };
    status = withStatus.status;
    code = withStatus.code;
    if (!status) {
      const statusMatch = /(?:^|\b)(401|402|403|424|429|500|503)(?:\b|:)/.exec(message);
      if (statusMatch) {
        status = parseInt(statusMatch[1], 10);
      }
    }
  } else if (raw && typeof raw === "object") {
    message = raw.message ?? "";
    status = raw.status;
    code = raw.code;
  }

  const lower = message.toLowerCase();

  // 1. Offline guest check
  if (
    lower.includes("guest mode is offline") ||
    lower.includes("sign in with email") ||
    (lower.includes("offline") && lower.includes("guest"))
  ) {
    return "Guest mode is offline. Sign in with email to build tools.";
  }

  // 2. Mapped friendly messages by status or code
  let friendly: string | null = null;
  if (
    status === 402 ||
    code === "insufficient_credits" ||
    lower.includes("credit balance depleted") ||
    lower.includes("out of credits")
  ) {
    friendly = "Credit balance depleted. Upgrade your plan to generate more tools.";
  } else if (
    status === 429 ||
    code === "rate_limit_exceeded" ||
    lower.includes("too many requests") ||
    lower.includes("daily limit reached") ||
    lower.includes("rate limit reached") ||
    lower.includes("wait a minute")
  ) {
    friendly = "Rate limit reached. Please wait a minute before generating again.";
  } else if (
    status === 503 ||
    code === "generation_disabled" ||
    code === "service_unavailable" ||
    lower.includes("temporarily disabled") ||
    lower.includes("temporarily busy")
  ) {
    friendly = "Generation is temporarily disabled. Please try again later.";
  }

  if (friendly) {
    return isDev ? `${friendly} (${message})` : friendly;
  }

  // In production, unknown errors show: "Failed to generate tool. Please try rephrasing."
  const fallback = "Failed to generate tool. Please try rephrasing.";
  return isDev && message ? `${fallback} (${message})` : fallback;
}
