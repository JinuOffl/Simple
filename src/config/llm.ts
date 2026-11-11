// src/config/llm.ts
// Edit this file to change LLM providers and models.

export const LLM_CONFIG = {
  // Primary provider — used for manifest generation and orchestration
  primary: {
    provider: "groq" as const,
    baseUrl: "https://api.groq.com/openai/v1",
    // Model used by the generation orchestrator (high capability)
    generationModel: "llama-3.3-70b-versatile",
    // Model used for the CRITIQUE step (cheap, fast)
    critiqueModel: "llama-3.1-8b-instant",
    // Model used for runtime llm_call actions in running apps
    runtimeModel: "llama-3.1-8b-instant",
    // Max tokens for generation
    generationMaxTokens: 4096,
    // Max tokens for runtime calls
    runtimeMaxTokens: 1024,
    // Temperature for generation (low = more deterministic)
    generationTemperature: 0.3,
    // Temperature for runtime calls (higher = more creative)
    runtimeTemperature: 0.7,
  },
  // Repair loop config
  repair: {
    // Max repair attempts across VALIDATE+CRITIQUE steps
    maxAttempts: 2,
    // Temperature for repair calls (lower = more conservative)
    temperature: 0.1,
  },
} as const;

export type LLMProvider = typeof LLM_CONFIG.primary.provider;
