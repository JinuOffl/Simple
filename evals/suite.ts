import { runGenerateOrchestrator } from "../supabase/functions/_shared/orchestrator/stateMachine.ts";
import { STARTER_TEMPLATES } from "../supabase/functions/_shared/orchestrator/templates.ts";
import { DEFAULT_LLM_CONFIG } from "../supabase/functions/_shared/orchestrator/llmConfig.ts";
import type {
  LLMProvider,
  ManifestV2Like,
  ValidationResult,
} from "../supabase/functions/_shared/orchestrator/types.ts";

export interface GoldenPromptExpectation {
  ok: boolean;
  unsupported?: boolean;
  templateMatched?: boolean;
  patchApplied?: boolean;
  minRepairs?: number;
  requiredComponents?: string[];
  requiredPermissions?: string[];
  requiredApis?: string[];
  requiredConnectors?: string[];
  preserveNodeIds?: string[];
  multiplayer?: boolean;
}

export interface GoldenPromptCase {
  id: string;
  category: string;
  prompt: string;
  editBase?: "weather" | "calculator";
  expect: GoldenPromptExpectation;
}

export interface EvalCaseOutcome {
  id: string;
  category: string;
  passed: boolean;
  schemaValidPostRepair: boolean;
  repaired: boolean;
  repairAttempts: number;
  templateMatched: boolean;
  latencyMs: number;
  failureReasons: string[];
}

export interface EvalSuiteSummary {
  mode: "scripted" | "live";
  totalCases: number;
  generationCases: number;
  honestyCases: number;
  passedCases: number;
  postRepairValidCount: number;
  postRepairValidRatePct: number;
  firstPassValidCount: number;
  templateMatchCount: number;
  latencyMs: {
    min: number;
    avg: number;
    p50: number;
    p95: number;
    max: number;
    total: number;
  };
  results: EvalCaseOutcome[];
}

function pickEditBase(editBase?: "weather" | "calculator"): ManifestV2Like | undefined {
  if (!editBase) return undefined;
  const slug = editBase === "calculator" ? "pocket-calculator" : "weather-forecast";
  const found = STARTER_TEMPLATES.find((t) => t.slug === slug);
  return found ? structuredClone(found.manifest) : undefined;
}

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((pct / 100) * sorted.length));
  return sorted[idx]!;
}

export async function runGoldenEvalSuite(
  cases: GoldenPromptCase[],
  options: {
    llmProvider: LLMProvider;
    validateManifest: (raw: unknown) => ValidationResult;
    mode: "scripted" | "live";
  }
): Promise<EvalSuiteSummary> {
  const results: EvalCaseOutcome[] = [];

  for (const item of cases) {
    const existingManifest = pickEditBase(item.editBase);
    const res = await runGenerateOrchestrator(
      {
        userPrompt: item.prompt,
        existingManifest,
      },
      {
        llmProvider: options.llmProvider,
        config: DEFAULT_LLM_CONFIG,
        validateManifest: options.validateManifest,
      }
    );

    const failureReasons: string[] = [];
    const expected = item.expect;

    if (res.ok !== expected.ok) {
      failureReasons.push(
        `Expected ok=${expected.ok}, got ok=${res.ok} (${res.error ?? "no error"})`
      );
    }

    if (expected.unsupported) {
      if (!res.unsupported?.message || !res.unsupported?.alternative) {
        failureReasons.push(
          "Expected honest unsupported refusal message and closest alternative."
        );
      }
    }

    if (expected.templateMatched && !res.trace.templateMatch.matched) {
      failureReasons.push("Expected templateMatch.matched=true.");
    }

    if (expected.patchApplied && !res.trace.patchApplied) {
      failureReasons.push("Expected RFC 6902 patchApplied=true.");
    }

    if (
      typeof expected.minRepairs === "number" &&
      res.trace.repairAttempts < expected.minRepairs
    ) {
      failureReasons.push(
        `Expected >= ${expected.minRepairs} repair attempt(s), saw ${res.trace.repairAttempts}.`
      );
    }

    const schemaValidPostRepair =
      res.ok && res.manifest ? options.validateManifest(res.manifest).kind === "valid" : false;

    if (expected.ok && !schemaValidPostRepair) {
      failureReasons.push("Expected post-repair manifest to pass strict validation.");
    }

    if (res.manifest) {
      const nodeTypes = new Set(res.manifest.screens.flatMap((s) => s.nodes.map((n) => n.type)));
      const nodeIds = new Set(res.manifest.screens.flatMap((s) => s.nodes.map((n) => n.id)));
      const perms = new Set(res.manifest.permissions);
      const apis = new Set(res.manifest.actions.map((a) => a.api).filter(Boolean));
      const conns = new Set(res.manifest.connectors.map((c) => c.connector_id));

      for (const reqComp of expected.requiredComponents ?? []) {
        if (!nodeTypes.has(reqComp)) {
          failureReasons.push(`Missing expected component "${reqComp}".`);
        }
      }
      for (const reqPerm of expected.requiredPermissions ?? []) {
        if (!perms.has(reqPerm as ManifestV2Like["permissions"][number])) {
          failureReasons.push(`Missing expected permission "${reqPerm}".`);
        }
      }
      for (const reqApi of expected.requiredApis ?? []) {
        if (!apis.has(reqApi)) {
          failureReasons.push(`Missing expected api_fetch "${reqApi}".`);
        }
      }
      for (const reqConn of expected.requiredConnectors ?? []) {
        if (!conns.has(reqConn)) {
          failureReasons.push(`Missing expected connector "${reqConn}".`);
        }
      }
      for (const keptId of expected.preserveNodeIds ?? []) {
        if (!nodeIds.has(keptId)) {
          failureReasons.push(`Expected untouched node ID "${keptId}" to be preserved.`);
        }
      }
      if (expected.multiplayer && !res.manifest.multiplayer?.enabled) {
        failureReasons.push("Expected manifest.multiplayer.enabled=true.");
      }
    }

    results.push({
      id: item.id,
      category: item.category,
      passed: failureReasons.length === 0,
      schemaValidPostRepair,
      repaired: res.trace.repairAttempts > 0,
      repairAttempts: res.trace.repairAttempts,
      templateMatched: res.trace.templateMatch.matched,
      latencyMs: res.trace.totalLatencyMs,
      failureReasons,
    });
  }

  const generationOutcomes = results.filter((_, i) => cases[i]!.expect.ok);
  const honestyOutcomes = results.filter((_, i) => !cases[i]!.expect.ok);
  const postRepairValidCount = generationOutcomes.filter((r) => r.schemaValidPostRepair).length;
  const firstPassValidCount = generationOutcomes.filter(
    (r) => r.schemaValidPostRepair && !r.repaired
  ).length;
  const sortedLatencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const totalLatency = sortedLatencies.reduce((acc, v) => acc + v, 0);

  return {
    mode: options.mode,
    totalCases: results.length,
    generationCases: generationOutcomes.length,
    honestyCases: honestyOutcomes.length,
    passedCases: results.filter((r) => r.passed).length,
    postRepairValidCount,
    postRepairValidRatePct:
      generationOutcomes.length > 0
        ? Number(((postRepairValidCount / generationOutcomes.length) * 100).toFixed(2))
        : 0,
    firstPassValidCount,
    templateMatchCount: results.filter((r) => r.templateMatched).length,
    latencyMs: {
      min: sortedLatencies[0] ?? 0,
      avg: results.length > 0 ? Number((totalLatency / results.length).toFixed(2)) : 0,
      p50: percentile(sortedLatencies, 50),
      p95: percentile(sortedLatencies, 95),
      max: sortedLatencies[sortedLatencies.length - 1] ?? 0,
      total: Number(totalLatency.toFixed(2)),
    },
    results,
  };
}

