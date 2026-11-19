/**
 * Parses an error from action invocations (api_fetch, llm_call, runtime actions)
 * and maps standard HTTP status codes (402, 424, 429) to friendly copy.
 */
export async function formatActionError(
  error: unknown,
  defaultMessage: string
): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  let status: number | undefined;
  let body: Record<string, unknown> | undefined;

  if (ctx) {
    status = ctx.status;
    if (typeof ctx.clone === "function") {
      try {
        body = (await ctx.clone().json()) as Record<string, unknown>;
      } catch {
        // ignore
      }
    }
  }

  if (!status && typeof (error as { status?: number })?.status === "number") {
    status = (error as { status: number }).status;
  }

  const errCode =
    typeof body?.error === "string"
      ? body.error
      : typeof (error as { code?: string })?.code === "string"
      ? (error as { code: string }).code
      : "";

  if (status === 402 || errCode === "insufficient_credits") {
    return "You are out of credits";
  }
  if (status === 424 || errCode === "missing_key") {
    return "Add your API key in the tool settings";
  }
  if (status === 429 || errCode === "rate_limit_exceeded") {
    return "Too many requests, wait a minute";
  }

  return defaultMessage;
}
