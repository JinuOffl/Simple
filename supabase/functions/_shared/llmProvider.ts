import { generateText } from "npm:ai@5.0.287";
import { createOpenAICompatible } from "npm:@ai-sdk/openai-compatible@1.0.60";
import {
  DEFAULT_LLM_CONFIG,
  resolveLlmRuntimeConfig,
  type ResolvedLlmRuntimeConfig,
  type ResolvedProviderEndpoint,
} from "./orchestrator/llmConfig.ts";
import type {
  LLMProvider,
  LlmJsonRequest,
  LlmJsonResponse,
  LlmRole,
} from "./orchestrator/types.ts";

export interface RuntimeTextRequest {
  role?: LlmRole;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
}

export interface RuntimeTextResponse {
  text: string;
  provider: string;
  model: string;
  usedFallback: boolean;
  latencyMs: number;
}

export interface VercelAiProviderOptions {
  runtimeConfig: ResolvedLlmRuntimeConfig;
  baseFetch?: typeof fetch;
  now?: () => number;
}

function selectModel(endpoint: ResolvedProviderEndpoint, role: LlmRole): string {
  switch (role) {
    case "generation":
      return endpoint.generationModel;
    case "critique":
      return endpoint.critiqueModel;
    case "runtime":
      return endpoint.runtimeModel;
  }
}

function selectMaxTokens(endpoint: ResolvedProviderEndpoint, role: LlmRole): number {
  if (role === "runtime") return endpoint.runtimeMaxTokens;
  if (role === "critique") return 512;
  return endpoint.generationMaxTokens;
}

function selectTemperature(endpoint: ResolvedProviderEndpoint, role: LlmRole): number {
  if (role === "runtime") return endpoint.runtimeTemperature;
  if (role === "critique") return 0.1;
  return endpoint.generationTemperature;
}

/**
 * Extract the outermost JSON object or array from an LLM text response,
 * stripping optional markdown code fences cleanly without mutating inner keys.
 */
export function extractJsonFromText(rawText: string): unknown {
  let cleaned = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstObj = cleaned.indexOf("{");
    const lastObj = cleaned.lastIndexOf("}");
    if (firstObj !== -1 && lastObj > firstObj) {
      return JSON.parse(cleaned.slice(firstObj, lastObj + 1));
    }
    const firstArr = cleaned.indexOf("[");
    const lastArr = cleaned.lastIndexOf("]");
    if (firstArr !== -1 && lastArr > firstArr) {
      return JSON.parse(cleaned.slice(firstArr, lastArr + 1));
    }
    throw new Error("Model output did not contain valid JSON.");
  }
}

export class VercelAiFallbackProvider implements LLMProvider {
  readonly name: string;
  private readonly runtimeConfig: ResolvedLlmRuntimeConfig;
  private readonly baseFetch?: typeof fetch;
  private readonly now: () => number;

  constructor(options: VercelAiProviderOptions) {
    this.runtimeConfig = options.runtimeConfig;
    this.name = options.runtimeConfig.primary.provider;
    this.baseFetch = options.baseFetch;
    this.now = options.now ?? (() => Date.now());
  }

  private async invokeEndpointText(
    endpoint: ResolvedProviderEndpoint,
    args: {
      role: LlmRole;
      system?: string;
      prompt?: string;
      messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<{ text: string; model: string }> {
    if (!endpoint.apiKey) {
      throw new Error(`Missing API key for provider "${endpoint.provider}".`);
    }

    const compat = createOpenAICompatible({
      name: endpoint.provider,
      baseURL: endpoint.baseUrl,
      apiKey: endpoint.apiKey,
      ...(this.baseFetch ? { fetch: this.baseFetch } : {}),
    });

    const modelId = selectModel(endpoint, args.role);
    const maxOutputTokens = args.maxTokens ?? selectMaxTokens(endpoint, args.role);
    const temperature = args.temperature ?? selectTemperature(endpoint, args.role);

    const isJsonRole = args.role === "generation" || args.role === "critique";
    const providerKey = endpoint.provider.split(".")[0].trim();
    const providerOptions = isJsonRole
      ? { [providerKey]: { response_format: { type: "json_object" } } }
      : undefined;

    const result = args.messages
      ? await generateText({
          model: compat(modelId),
          messages: args.messages,
          temperature,
          maxOutputTokens,
          providerOptions,
        })
      : await generateText({
          model: compat(modelId),
          system: args.system,
          prompt: args.prompt ?? "",
          temperature,
          maxOutputTokens,
          providerOptions,
        });

    return { text: result.text, model: modelId };
  }

  async completeJson<T = unknown>(request: LlmJsonRequest): Promise<LlmJsonResponse<T>> {
    const start = this.now();
    const { primary, fallback } = this.runtimeConfig;
    const errors: string[] = [];

    if (primary.apiKey) {
      try {
        const res = await this.invokeEndpointText(primary, {
          role: request.role,
          system: request.system,
          prompt: request.prompt,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
        });
        const parsed = extractJsonFromText(res.text) as T;
        return {
          data: parsed,
          rawText: res.text,
          provider: primary.provider,
          model: res.model,
          usedFallback: false,
          latencyMs: Math.max(0, this.now() - start),
        };
      } catch (err) {
        errors.push(
          `Primary (${primary.provider}): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else {
      errors.push(`Primary (${primary.provider}): API key not configured`);
    }

    if (fallback.apiKey) {
      try {
        const res = await this.invokeEndpointText(fallback, {
          role: request.role,
          system: request.system,
          prompt: request.prompt,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
        });
        const parsed = extractJsonFromText(res.text) as T;
        return {
          data: parsed,
          rawText: res.text,
          provider: fallback.provider,
          model: res.model,
          usedFallback: true,
          latencyMs: Math.max(0, this.now() - start),
        };
      } catch (err) {
        errors.push(
          `Fallback (${fallback.provider}): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else {
      errors.push(`Fallback (${fallback.provider}): API key not configured`);
    }

    throw new Error(`All configured LLM providers failed. ${errors.join(" | ")}`);
  }

  async completeMessages(request: RuntimeTextRequest): Promise<RuntimeTextResponse> {
    const start = this.now();
    const role = request.role ?? "runtime";
    const { primary, fallback } = this.runtimeConfig;
    const errors: string[] = [];

    if (primary.apiKey) {
      try {
        const res = await this.invokeEndpointText(primary, {
          role,
          messages: request.messages,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
        });
        return {
          text: res.text,
          provider: primary.provider,
          model: res.model,
          usedFallback: false,
          latencyMs: Math.max(0, this.now() - start),
        };
      } catch (err) {
        errors.push(
          `Primary (${primary.provider}): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } else {
      errors.push(`Primary (${primary.provider}): API key not configured`);
    }

    if (fallback.apiKey) {
      try {
        const res = await this.invokeEndpointText(fallback, {
          role,
          messages: request.messages,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
        });
        return {
          text: res.text,
          provider: fallback.provider,
          model: res.model,
          usedFallback: true,
          latencyMs: Math.max(0, this.now() - start),
        };
      } catch (err) {
        errors.push(
          `Fallback (${fallback.provider}): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    throw new Error(`All configured LLM providers failed. ${errors.join(" | ")}`);
  }
}

export function createEnvBackedLlmProvider(
  getEnv: (key: string) => string | undefined = (k) => Deno.env.get(k),
  baseFetch?: typeof fetch
): VercelAiFallbackProvider {
  const runtimeConfig = resolveLlmRuntimeConfig(getEnv, DEFAULT_LLM_CONFIG);
  return new VercelAiFallbackProvider({ runtimeConfig, baseFetch });
}

