import type {
  LLMProvider,
  LlmJsonRequest,
  LlmJsonResponse,
} from "../../supabase/functions/_shared/orchestrator/types.ts";
import { DEFAULT_LLM_CONFIG } from "../../supabase/functions/_shared/orchestrator/llmConfig.ts";

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

export class BrowserGroqLlmProvider implements LLMProvider {
  readonly name = "browser-groq";
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async completeJson<T = unknown>(request: LlmJsonRequest): Promise<LlmJsonResponse<T>> {
    const start = Date.now();
    const candidateModels = [
      DEFAULT_LLM_CONFIG.primary.generationModel,
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "openai/gpt-oss-120b",
    ];

    let lastError: Error | null = null;

    for (const model of candidateModels) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey.trim()}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.prompt },
            ],
            temperature: request.temperature ?? 0.1,
            response_format: { type: "json_object" },
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          if (res.status === 404 || res.status === 400 || res.status === 422) {
            lastError = new Error(`Groq model ${model} unavailable (${res.status}): ${text}`);
            continue;
          }
          throw new Error(`Groq API error (${res.status}): ${text}`);
        }

        const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const rawText = json.choices?.[0]?.message?.content ?? "";
        const data = extractJsonFromText(rawText) as T;

        return {
          data,
          rawText,
          provider: "browser-groq",
          model,
          usedFallback: model !== candidateModels[0],
          latencyMs: Date.now() - start,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError ?? new Error("All candidate Groq models failed.");
  }
}
