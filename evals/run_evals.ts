import { createEnvBackedLlmProvider } from "../supabase/functions/_shared/llmProvider.ts";
import { validateManifestDeno } from "../supabase/functions/_shared/manifestValidator.ts";
import {
  DEFAULT_LLM_CONFIG,
  resolveLlmRuntimeConfig,
} from "../supabase/functions/_shared/orchestrator/llmConfig.ts";
import type { LLMProvider } from "../supabase/functions/_shared/orchestrator/types.ts";
import { ScriptedEvalLlmProvider } from "./mockProvider.ts";
import {
  runGoldenEvalSuite,
  runEditChainsSuite,
  type GoldenPromptCase,
  type EditChainCase,
} from "./suite.ts";

async function loadEnvFileIfPresent(): Promise<void> {
  try {
    const text = await Deno.readTextFile(".env");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim();
        if (!Deno.env.get(key)) {
          Deno.env.set(key, val);
        }
      }
    }
  } catch {
    // .env file optional
  }
}

if (import.meta.main) {
  await loadEnvFileIfPresent();

  const args = new Set(Deno.args);
  const liveMode = args.has("--live");
  const chainsMode = args.has("--chains");

  let provider: LLMProvider;
  if (liveMode) {
    const cfg = resolveLlmRuntimeConfig((k) => Deno.env.get(k), DEFAULT_LLM_CONFIG);
    if (!cfg.primary.apiKey && !cfg.fallback.apiKey) {
      console.error(
        "ERROR: --live requires GROQ_API_KEY, LLM_PRIMARY_API_KEY, or OPENAI_API_KEY in environment or .env."
      );
      Deno.exit(2);
    }
    provider = createEnvBackedLlmProvider((k) => Deno.env.get(k));
  } else {
    provider = new ScriptedEvalLlmProvider();
  }

  if (chainsMode) {
    const raw = await Deno.readTextFile("evals/edit_chains.json");
    const chains = JSON.parse(raw) as EditChainCase[];

    console.log(
      `Running edit chains suite (${chains.length} chains, 6 steps each) in ${
        liveMode ? "LIVE (" + provider.name + ")" : "SCRIPTED"
      } mode...`
    );

    const summary = await runEditChainsSuite(chains, {
      llmProvider: provider,
      validateManifest: validateManifestDeno,
      mode: liveMode ? "live" : "scripted",
    });

    console.log("=== Simple v2 Phase 3 Edit Chains Summary ===");
    console.log(`Mode:                    ${summary.mode}`);
    console.log(`Total chains:            ${summary.totalChains}`);
    console.log(`Total edit steps:        ${summary.totalSteps}`);
    console.log(`Passed steps:            ${summary.passedSteps}/${summary.totalSteps}`);
    console.log(
      `First-pass valid rate:   ${summary.firstPassValidRatePct}% (${summary.firstPassValidCount}/${summary.totalSteps})`
    );
    console.log(
      `Post-repair valid rate:  ${summary.postRepairValidRatePct}% (${summary.postRepairValidCount}/${summary.totalSteps})`
    );
    console.log(`Average repairs / step:  ${summary.avgRepairsPerStep}`);
    console.log(
      `Latency (ms):            min=${summary.latencyMs.min} avg=${summary.latencyMs.avg} p50=${summary.latencyMs.p50} p95=${summary.latencyMs.p95} max=${summary.latencyMs.max}`
    );

    if (summary.failures.length > 0) {
      console.log("\nFailures:");
      for (const f of summary.failures) {
        console.log(`\n- [${f.chainId} Step ${f.step}] Prompt: "${f.prompt}"`);
        console.log(`  Error: ${f.error}`);
        if (f.rawModelOutput) {
          console.log(`  Raw Model Output: ${f.rawModelOutput}`);
        }
      }
    } else {
      console.log("\nAll edit chain steps completed with zero failures.");
    }

    if (summary.postRepairValidRatePct < 90 || summary.passedSteps < summary.totalSteps) {
      Deno.exit(1);
    }
  } else {
    const raw = await Deno.readTextFile("evals/golden_prompts.json");
    const cases = JSON.parse(raw) as GoldenPromptCase[];

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
}
