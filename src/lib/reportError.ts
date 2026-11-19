export interface ReportErrorContext {
  readonly [key: string]: unknown;
}

export interface SanitizedErrorPayload {
  readonly message: string;
  readonly stack: string;
  readonly route: string;
  readonly version: string;
  readonly timestamp: string;
}

const APP_VERSION = "0.0.0";

/**
 * Lightweight, zero-dependency error tracking hook.
 *
 * In development: logs to console.error.
 * In production: sends a sanitized telemetry beacon via navigator.sendBeacon
 * strictly if VITE_ERROR_ENDPOINT is defined.
 *
 * Security & Privacy:
 * NEVER includes user prompts, manifests, auth tokens, or private data.
 * Only message, truncated stack (1500 chars max), route, and version.
 */
export function reportError(error: unknown, _context?: ReportErrorContext): void {
  if (import.meta.env.DEV) {
    console.error("[reportError]", error);
    return;
  }

  const endpoint = (import.meta.env.VITE_ERROR_ENDPOINT as string | undefined)?.trim();
  if (!endpoint) {
    return;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "Unknown non-Error object thrown";

  const rawStack = error instanceof Error && typeof error.stack === "string" ? error.stack : "";
  const stack = rawStack.slice(0, 1500);

  const route =
    typeof window !== "undefined"
      ? (window.location.hash || window.location.pathname || "/")
      : "";

  const payload: SanitizedErrorPayload = {
    message,
    stack,
    route,
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
  };

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      navigator.sendBeacon(endpoint, blob);
    }
  } catch {
    // Non-blocking telemetry failure
  }
}
