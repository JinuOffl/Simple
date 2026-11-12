/**
 * Shared LLM provider & model configuration.
 *
 * Pure TypeScript with no environment globals so it runs identically in
 * Vite/Vitest (browser/Node) and Supabase Edge Functions (Deno).
 * Runtime secrets (API keys) stay strictly server-side via `resolveLlmRuntimeConfig`.
 */

export interface ProviderEndpointConfig {
  readonly provider: string;
  readonly baseUrl: string;
  readonly generationModel: string;
  readonly critiqueModel: string;
  readonly runtimeModel: string;
  readonly generationMaxTokens: number;
  readonly runtimeMaxTokens: number;
  readonly generationTemperature: number;
  readonly runtimeTemperature: number;
}

export interface RepairConfig {
  readonly maxAttempts: number;
  readonly temperature: number;
}

export interface LlmConfig {
  readonly primary: ProviderEndpointConfig;
  readonly fallback: ProviderEndpointConfig;
  readonly repair: RepairConfig;
}

export interface ResolvedProviderEndpoint extends ProviderEndpointConfig {
  readonly apiKey?: string;
}

export interface ResolvedLlmRuntimeConfig {
  readonly primary: ResolvedProviderEndpoint;
  readonly fallback: ResolvedProviderEndpoint;
  readonly repair: RepairConfig;
}

export const DEFAULT_LLM_CONFIG = {
  primary: {
    provider: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    generationModel: "llama-3.3-70b-versatile",
    critiqueModel: "llama-3.1-8b-instant",
    runtimeModel: "llama-3.1-8b-instant",
    generationMaxTokens: 4096,
    runtimeMaxTokens: 1024,
    generationTemperature: 0.3,
    runtimeTemperature: 0.7,
  },
  fallback: {
    provider: "openai-compatible",
    baseUrl: "https://api.openai.com/v1",
    generationModel: "gpt-4o-mini",
    critiqueModel: "gpt-4o-mini",
    runtimeModel: "gpt-4o-mini",
    generationMaxTokens: 4096,
    runtimeMaxTokens: 1024,
    generationTemperature: 0.3,
    runtimeTemperature: 0.7,
  },
  repair: {
    maxAttempts: 2,
    temperature: 0.1,
  },
} as const satisfies LlmConfig;

/**
 * Resolve runtime provider configuration from server-side environment variables,
 * falling back to `DEFAULT_LLM_CONFIG` when overrides are unset.
 */
export function resolveLlmRuntimeConfig(
  getEnv: (key: string) => string | undefined,
  baseConfig: LlmConfig = DEFAULT_LLM_CONFIG,
  userOverrides?: { apiKey?: string; provider?: string }
): ResolvedLlmRuntimeConfig {
  const nonEmpty = (key: string): string | undefined => {
    const raw = getEnv(key);
    if (typeof raw !== "string") return undefined;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const parsedRepairAttempts = Number(nonEmpty("REPAIR_MAX_ATTEMPTS"));
  const maxAttempts =
    Number.isInteger(parsedRepairAttempts) && parsedRepairAttempts >= 0 && parsedRepairAttempts <= 5
      ? parsedRepairAttempts
      : baseConfig.repair.maxAttempts;

  const primaryApiKey =
    userOverrides?.apiKey ??
    nonEmpty("LLM_PRIMARY_API_KEY") ??
    nonEmpty("GROQ_API_KEY");

  const primaryProvider =
    userOverrides?.provider ??
    nonEmpty("LLM_PRIMARY_PROVIDER") ??
    baseConfig.primary.provider;

  return {
    primary: {
      provider: primaryProvider,
      baseUrl: nonEmpty("LLM_PRIMARY_BASE_URL") ?? baseConfig.primary.baseUrl,
      generationModel: nonEmpty("GENERATION_MODEL") ?? baseConfig.primary.generationModel,
      critiqueModel: nonEmpty("CRITIQUE_MODEL") ?? baseConfig.primary.critiqueModel,
      runtimeModel: nonEmpty("RUNTIME_LLM_MODEL") ?? baseConfig.primary.runtimeModel,
      generationMaxTokens: baseConfig.primary.generationMaxTokens,
      runtimeMaxTokens: baseConfig.primary.runtimeMaxTokens,
      generationTemperature: baseConfig.primary.generationTemperature,
      runtimeTemperature: baseConfig.primary.runtimeTemperature,
      apiKey: primaryApiKey,
    },
    fallback: {
      provider: nonEmpty("LLM_FALLBACK_PROVIDER") ?? baseConfig.fallback.provider,
      baseUrl: nonEmpty("LLM_FALLBACK_BASE_URL") ?? baseConfig.fallback.baseUrl,
      generationModel:
        nonEmpty("LLM_FALLBACK_GENERATION_MODEL") ?? baseConfig.fallback.generationModel,
      critiqueModel:
        nonEmpty("LLM_FALLBACK_CRITIQUE_MODEL") ?? baseConfig.fallback.critiqueModel,
      runtimeModel: nonEmpty("LLM_FALLBACK_RUNTIME_MODEL") ?? baseConfig.fallback.runtimeModel,
      generationMaxTokens: baseConfig.fallback.generationMaxTokens,
      runtimeMaxTokens: baseConfig.fallback.runtimeMaxTokens,
      generationTemperature: baseConfig.fallback.generationTemperature,
      runtimeTemperature: baseConfig.fallback.runtimeTemperature,
      apiKey:
        nonEmpty("LLM_FALLBACK_API_KEY") ??
        nonEmpty("OPENAI_API_KEY") ??
        nonEmpty("FALLBACK_API_KEY"),
    },
    repair: {
      maxAttempts,
      temperature: baseConfig.repair.temperature,
    },
  };
}

