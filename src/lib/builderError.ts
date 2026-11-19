/**
 * Error message mapping for builder screen.
 * Maps raw server errors/status codes to user-friendly copy and hides internal details in production.
 */
export function mapBuilderErrorMessage(
  rawError: string,
  isDev: boolean = import.meta.env.DEV
): string {
  const lower = rawError.toLowerCase();

  let friendly: string | null = null;
  if (
    lower.includes("guest mode is offline") ||
    lower.includes("sign in with email") ||
    (lower.includes("offline") && lower.includes("guest"))
  ) {
    return "Guest mode is offline. Sign in with email to build tools.";
  }
  if (lower.includes("402") || lower.includes("credit") || lower.includes("balance depleted")) {
    friendly = "Credit balance depleted. Upgrade your plan to generate more tools.";
  } else if (
    lower.includes("429") ||
    lower.includes("too many requests") ||
    lower.includes("rate limit") ||
    lower.includes("wait a minute")
  ) {
    friendly = "Rate limit reached. Please wait a minute before generating again.";
  } else if (
    lower.includes("503") ||
    lower.includes("temporarily disabled") ||
    lower.includes("disabled")
  ) {
    friendly = "Generation is temporarily disabled. Please try again later.";
  }

  if (friendly) {
    return isDev ? `${friendly} (${rawError})` : friendly;
  }

  if (
    rawError.length > 0 &&
    !rawError.includes("Failed to generate") &&
    !rawError.includes("failed to fetch") &&
    !rawError.includes("NetworkError")
  ) {
    return isDev ? `${rawError} (${rawError})` : rawError;
  }

  const fallback = "Failed to generate tool. Please try rephrasing your request.";
  return isDev ? `${fallback} (${rawError})` : fallback;
}
