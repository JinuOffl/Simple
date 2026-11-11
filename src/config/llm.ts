import { DEFAULT_LLM_CONFIG } from "../../supabase/functions/_shared/orchestrator/llmConfig.ts";

/**
 * Global LLM configuration for Simple v2.
 * Re-exported from the single shared source of truth used by both Edge Functions and UI/evals.
 * Note: Secret API keys MUST live in server-side env vars — never put secrets here.
 */
export const LLM_CONFIG = DEFAULT_LLM_CONFIG;

export type LLMProviderName = typeof LLM_CONFIG.primary.provider | typeof LLM_CONFIG.fallback.provider;
export type LLMProvider = typeof LLM_CONFIG.primary.provider;
export type {
  LlmConfig,
  ProviderEndpointConfig,
  RepairConfig,
  ResolvedLlmRuntimeConfig,
  ResolvedProviderEndpoint,
} from "../../supabase/functions/_shared/orchestrator/llmConfig.ts";
export { resolveLlmRuntimeConfig } from "../../supabase/functions/_shared/orchestrator/llmConfig.ts";
