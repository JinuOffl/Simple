/**
 * Security & sanitization guards for Phase 4 MCP connector calls and runtime actions.
 * Pure TypeScript with no environment globals so it runs cleanly in both Deno and Vite/Vitest.
 */

const FORBIDDEN_ARG_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_ARGS_BYTES = 16 * 1024;
const MAX_ARGS_DEPTH = 6;
const MAX_OUTPUT_BYTES = 64 * 1024;

const HIGH_RISK_TOOL_PATTERNS: readonly RegExp[] = [
  /(^|[._-])(unlock|disarm|arm|open_door|open_garage|lock_override)($|[._-])/i,
  /(^|[._-])(delete|destroy|remove|drop|wipe|erase|purge|reset|format)($|[._-])/i,
  /(^|[._-])(shutdown|reboot|restart|power_off|kill)($|[._-])/i,
  /(^|[._-])(transfer|pay|charge|refund|send_money|withdraw|send_email|send_sms)($|[._-])/i,
  /(^|[._-])(grant|revoke|admin|exec|eval|shell)($|[._-])/i,
];

/**
 * Returns true if an MCP tool performs destructive, physical-security,
 * financial, or external-communication actions requiring an explicit extra user confirmation tap.
 */
export function isHighRiskMcpTool(toolName: string | undefined): boolean {
  if (!toolName || typeof toolName !== "string") return false;
  return HIGH_RISK_TOOL_PATTERNS.some((re) => re.test(toolName.trim()));
}

function inspectArgsValue(
  value: unknown,
  depth: number
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (depth > MAX_ARGS_DEPTH) {
    return { ok: false, error: `MCP tool args exceed maximum nesting depth (${MAX_ARGS_DEPTH}).` };
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return { ok: true, value };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { ok: false, error: "MCP tool numeric argument must be finite." };
    }
    return { ok: true, value };
  }

  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const checked = inspectArgsValue(item, depth + 1);
      if (!checked.ok) return checked;
      out.push(checked.value);
    }
    return { ok: true, value: out };
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    for (const key of Object.keys(record)) {
      if (FORBIDDEN_ARG_KEYS.has(key)) {
        return { ok: false, error: `Forbidden MCP argument key "${key}".` };
      }
      if (key.length > 128) {
        return { ok: false, error: "MCP argument key exceeds maximum length (128)." };
      }
      const checked = inspectArgsValue(record[key], depth + 1);
      if (!checked.ok) return checked;
      clean[key] = checked.value;
    }
    return { ok: true, value: clean };
  }

  return { ok: false, error: `Unsupported MCP argument type: ${typeof value}` };
}

export function validateMcpToolArgs(
  rawArgs: unknown
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  if (rawArgs === undefined || rawArgs === null) {
    return { ok: true, args: {} };
  }
  if (typeof rawArgs !== "object" || Array.isArray(rawArgs)) {
    return { ok: false, error: "MCP tool params must be a JSON object." };
  }

  const checked = inspectArgsValue(rawArgs, 0);
  if (!checked.ok) return checked;

  const serialized = JSON.stringify(checked.value);
  const byteLen = new TextEncoder().encode(serialized).length;
  if (byteLen > MAX_ARGS_BYTES) {
    return {
      ok: false,
      error: `MCP tool params exceed maximum allowed size (${MAX_ARGS_BYTES} bytes).`,
    };
  }

  return { ok: true, args: checked.value as Record<string, unknown> };
}

/**
 * Validate HTTP header names allowed for static MCP connector authentication (ADR 005).
 */
export function normalizeAuthHeaderName(headerName: string | undefined): string {
  const candidate = (headerName ?? "Authorization").trim();
  if (!candidate) return "Authorization";
  if (!/^[A-Za-z0-9-]+$/.test(candidate)) {
    throw new Error("Invalid auth header name; only letters, digits, and hyphens are allowed.");
  }
  const lower = candidate.toLowerCase();
  if (lower === "host" || lower === "content-length" || lower === "connection") {
    throw new Error(`Header "${candidate}" cannot be used as an auth header.`);
  }
  return candidate;
}

const ANSI_CSI_REGEX = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*[A-Za-z]`, "g");

function stripNonPrintableControlChars(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code === 0x09 || code === 0x0a || code === 0x0d || (code >= 0x20 && code !== 0x7f)) {
      out += input[i];
    }
  }
  return out;
}

/**
 * Strip control characters, ANSI escape codes, and prompt/instruction injection delimiters
 * from untrusted external MCP tool outputs before displaying or returning to clients.
 */
export function sanitizeToolOutputText(rawText: string): string {
  // Remove ANSI escape sequences
  let cleaned = rawText.replace(ANSI_CSI_REGEX, "");
  // Remove non-printable ASCII control chars except \t (09), \n (0A), \r (0D)
  cleaned = stripNonPrintableControlChars(cleaned);
  // Defang common LLM control/system markers if echoed by malicious tool output
  cleaned = cleaned
    .replace(/<\/?(?:system|assistant|tool_call|SYSTEM_MESSAGE)[^>]*>/gi, "[redacted-tag]")
    .replace(/<\|[a-zA-Z0-9_]+\|>/g, "[redacted-token]");

  const encoder = new TextEncoder();
  if (encoder.encode(cleaned).length > MAX_OUTPUT_BYTES) {
    cleaned = `${cleaned.slice(0, 8192)}... [truncated]`;
  }

  return cleaned.trim();
}
