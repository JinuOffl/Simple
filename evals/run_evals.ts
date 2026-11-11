import { createEnvBackedLlmProvider } from "../supabase/functions/_shared/llmProvider.ts";
import { validateManifestDeno } from "../supabase/functions/_shared/manifestValidator.ts";
import {
  DEFAULT_LLM_CONFIG,
  resolveLlmRuntimeConfig,
} from "../supabase/functions/_shared/orchestrator/llmConfig.ts";
import type { LLMProvider } from "../supabase/functions/_shared/orchestrator/types.ts";
import { ScriptedEvalLlmProvider } from "./mockProvider.ts";
import { runGoldenEvalSuite, type GoldenPromptCase } from "./suite.ts";

if (import.meta.main) {
  const args = new Set(Deno.args);
  const liveMode = args.has("--live");
  const raw = await Deno.readTextFile("evals/golden_prompts.json");
  const cases = JSON.parse(raw) as GoldenPromptCase[];

  let provider: LLMProvider;
  if (liveMode) {
    const cfg = resolveLlmRuntimeConfig((k) => Deno.env.get(k), DEFAULT_LLM_CONFIG);
    if (!cfg.primary.apiKey && !cfg.fallback.apiKey) {
      console.error("ERROR: --live requires GROQ_API_KEY or OPENAI_API_KEY in environment.");
      Deno.exit(2);
    }
    provider = createEnvBackedLlmProvider((k) => Deno.env.get(k));
  } else {
    provider = new ScriptedEvalLlmProvider();
  }

  const summary = await runGoldenEvalSuite(cases, {
    llmProvider: provider,
    validateManifest: validateManifestDeno,
    mode: liveMode ? "live" : "scripted",
  });

  console.log("=== Simple v2 Phase 3 Evals Summary ===");
  console.log(`Mode:                    ${summary.mode}`);
  console.log(`Total golden prompts:    ${summary.totalCases}`);
  console.log(`Passed cases:            ${summary.passedCases}/${summary.totalCases}`);
  console.log(
    `Post-repair valid rate:  ${summary.postRepairValidRatePct}% (${summary.postRepairValidCount}/${summary.generationCases})`
  );
  console.log(`First-pass valid count:  ${summary.firstPassValidCount}/${summary.generationCases}`);
  console.log(`Template match count:    ${summary.templateMatchCount}/${summary.totalCases}`);
  console.log(
    `Latency (ms):            min=${summary.latencyMs.min} avg=${summary.latencyMs.avg} p50=${summary.latencyMs.p50} p95=${summary.latencyMs.p95} max=${summary.latencyMs.max}`
  );

  const failed = summary.results.filter((r) => !r.passed);
  if (failed.length > 0) {
    console.log("\nFailures:");
    for (const f of failed) {
      console.log(`- [${f.id}] ${f.failureReasons.join(" | ")}`);
    }
  }

  if (summary.postRepairValidRatePct < 95 || summary.passedCases < summary.totalCases) {
    Deno.exit(1);
  }
}
