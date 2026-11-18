export interface GenerationLogEntry {
  time: number;
  tier?: "local" | "edge" | "browser" | "template";
  userPrompt: string;
  existingManifestBytes: number;
  ok: boolean;
  error?: string;
  validationErrors?: string[];
  repairAttempts?: number;
  latencyMs: number;
}

const MAX_LOG_ENTRIES = 20;
const ringBuffer: GenerationLogEntry[] = [];

export function logGeneration(entry: Omit<GenerationLogEntry, "time"> & { time?: number }): void {
  const item: GenerationLogEntry = {
    time: entry.time ?? Date.now(),
    tier: entry.tier,
    userPrompt: entry.userPrompt,
    existingManifestBytes: entry.existingManifestBytes,
    ok: entry.ok,
    error: entry.error,
    validationErrors: entry.validationErrors,
    repairAttempts: entry.repairAttempts,
    latencyMs: entry.latencyMs,
  };
  ringBuffer.push(item);
  if (ringBuffer.length > MAX_LOG_ENTRIES) {
    ringBuffer.shift();
  }
}

export function getGenerationLog(): GenerationLogEntry[] {
  return [...ringBuffer];
}

export function clearGenerationLog(): void {
  ringBuffer.length = 0;
}
