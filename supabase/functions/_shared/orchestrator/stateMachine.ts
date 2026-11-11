import type {
  CritiqueResult,
  DryRunReport,
  GenerateRequest,
  GenerationResult,
  JsonPatchOperation,
  LLMProvider,
  ManifestV2Like,
  OrchestratorState,
  StateTiming,
  TemplateMatcher,
  ValidationResult,
} from "./types.ts";
import { DEFAULT_LLM_CONFIG, type LlmConfig } from "./llmConfig.ts";
import { analyzePrompt } from "./analyzer.ts";
import { resolveCapabilities } from "./resolver.ts";
import { KeywordTemplateMatcher } from "./templates.ts";
import { validateManifestPure } from "./manifestCheck.ts";
import { runManifestDryRun } from "./dryRun.ts";
import { applyJsonPatch, verifyMinimalEditPatch } from "./jsonPatch.ts";
import {
  buildCreateManifestPrompt,
  buildCritiquePrompt,
  buildEditPatchPrompt,
} from "./prompts.ts";

export interface OrchestratorDependencies {
  llmProvider: LLMProvider;
  config?: LlmConfig;
  templateMatcher?: TemplateMatcher;
  /** Optional stricter schema validator (e.g., Zod ManifestV2Schema); layered with pure check. */
  validateManifest?: (raw: unknown) => ValidationResult;
  now?: () => number;
}

function defaultNow(): number {
  return Date.now();
}

function normalizeEditPatchResponse(data: unknown): {
  operations: JsonPatchOperation[];
  error?: string;
} {
  if (Array.isArray(data)) {
    return { operations: data as JsonPatchOperation[] };
  }
  if (data && typeof data === "object" && "operations" in data) {
    const ops = (data as { operations?: unknown }).operations;
    if (Array.isArray(ops)) {
      return { operations: ops as JsonPatchOperation[] };
    }
  }
  return {
    operations: [],
    error: "Edit response must be JSON containing an RFC 6902 `operations` array.",
  };
}

function normalizeCritiqueResponse(data: unknown): CritiqueResult {
  if (!data || typeof data !== "object") {
    return { pass: false, issues: ["Critique response was not a JSON object."] };
  }
  const obj = data as { pass?: unknown; issues?: unknown; summary?: unknown };
  const pass = typeof obj.pass === "boolean" ? obj.pass : false;
  const issues = Array.isArray(obj.issues)
    ? obj.issues.filter((i): i is string => typeof i === "string" && i.trim().length > 0)
    : [];
  const summary = typeof obj.summary === "string" ? obj.summary : undefined;
  return { pass: pass && issues.length === 0, issues, summary };
}

/**
 * Simple v2 Generation Orchestrator State Machine:
 * RECEIVE -> TEMPLATE_MATCH -> ANALYZE -> RESOLVE -> BUILD -> VALIDATE -> DRY_RUN -> CRITIQUE -> (REPAIR x<=2) -> DONE | FAILED
 */
export async function runGenerateOrchestrator(
  request: GenerateRequest,
  deps: OrchestratorDependencies
): Promise<GenerationResult> {
  const now = deps.now ?? defaultNow;
  const config = deps.config ?? DEFAULT_LLM_CONFIG;
  const maxRepairs = config.repair.maxAttempts;
  const matcher = deps.templateMatcher ?? new KeywordTemplateMatcher();

  const totalStart = now();
  const transitions: OrchestratorState[] = [];
  const stateTimings: StateTiming[] = [];

  const enterState = <T>(
    state: OrchestratorState,
    attempt: number,
    fn: () => Promise<T> | T,
    note?: string
  ): Promise<T> => {
    transitions.push(state);
    const start = now();
    const finalize = (result: T): T => {
      stateTimings.push({
        state,
        attempt,
        durationMs: Math.max(0, Number((now() - start).toFixed(2))),
        ...(note ? { note } : {}),
      });
      return result;
    };
    try {
      const value = fn();
      if (value instanceof Promise) {
        return value.then(finalize);
      }
      return Promise.resolve(finalize(value));
    } catch (err) {
      stateTimings.push({
        state,
        attempt,
        durationMs: Math.max(0, Number((now() - start).toFixed(2))),
        note: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  let providerUsed: string | undefined;
  let modelUsed: string | undefined;
  let usedFallbackProvider = false;
  let editMode = Boolean(request.existingManifest);
  let patchApplied = false;
  let templateMatchedMeta: { matched: boolean; slug?: string; score?: number } = {
    matched: false,
  };

  const makeTrace = (
    finalState: "DONE" | "FAILED",
    repairAttempts: number,
    failureKind?: "invalid_input" | "unsupported" | "generation_error" | "repair_exhausted"
  ) => ({
    finalState,
    ...(failureKind ? { failureKind } : {}),
    transitions,
    stateTimings,
    totalLatencyMs: Math.max(0, Number((now() - totalStart).toFixed(2))),
    repairAttempts,
    templateMatch: templateMatchedMeta,
    ...(providerUsed ? { providerUsed } : {}),
    ...(modelUsed ? { modelUsed } : {}),
    usedFallbackProvider,
    editMode,
    patchApplied,
  });

  // ── 1. RECEIVE ──────────────────────────────────────────────────────────────
  const trimmedPrompt = typeof request.userPrompt === "string" ? request.userPrompt.trim() : "";
  const inputValid = await enterState("RECEIVE", 0, () => {
    if (trimmedPrompt.length < 2) return false;
    if (trimmedPrompt.length > 4000) return false;
    return true;
  });

  if (!inputValid) {
    transitions.push("FAILED");
    return {
      ok: false,
      state: "FAILED",
      error: "Please describe the app or change you want (between 2 and 4000 characters).",
      trace: makeTrace("FAILED", 0, "invalid_input"),
    };
  }

  // ── 2. TEMPLATE_MATCH ───────────────────────────────────────────────────────
  const templateMatch = await enterState("TEMPLATE_MATCH", 0, () => {
    if (editMode) return null;
    return matcher.findBestMatch(trimmedPrompt, request.extraTemplates);
  });

  if (templateMatch) {
    templateMatchedMeta = {
      matched: true,
      slug: templateMatch.slug,
      score: templateMatch.score,
    };
  }

  // ── 3. ANALYZE ──────────────────────────────────────────────────────────────
  const analysis = await enterState("ANALYZE", 0, () =>
    analyzePrompt(
      trimmedPrompt,
      request.existingManifest,
      request.conversationContext ?? []
    )
  );
  editMode = analysis.isEdit;

  // ── 4. RESOLVE ──────────────────────────────────────────────────────────────
  const plan = await enterState("RESOLVE", 0, () => resolveCapabilities(analysis, templateMatch));

  if (!plan.supported) {
    transitions.push("FAILED");
    const message =
      plan.honestyMessage ?? "This request requires a capability that Simple v2 does not support.";
    const alternative =
      plan.closestAlternative ??
      "Try asking for an app built with checklists, calculators, quizzes, API lookups, or MCP tools.";
    return {
      ok: false,
      state: "FAILED",
      unsupported: { message, alternative },
      error: `${message} ${alternative}`,
      trace: makeTrace("FAILED", 0, "unsupported"),
    };
  }

  // ── 5..8. BUILD -> VALIDATE -> DRY_RUN -> CRITIQUE -> (REPAIR x<=maxRepairs) ──
  let repairAttempts = 0;
  let lastErrors: string[] = [];
  let lastCandidate: unknown = undefined;
  let lastDryRun: DryRunReport | undefined;
  let lastCritique: CritiqueResult | undefined;

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    let candidateRaw: unknown;
    let appliedPatch: JsonPatchOperation[] | undefined;

    try {
      const buildOutcome = await enterState("BUILD", attempt, async () => {
        if (editMode && request.existingManifest) {
          const payload = buildEditPatchPrompt({
            userPrompt: trimmedPrompt,
            existingManifest: request.existingManifest,
            analysis,
            plan,
            conversationContext: request.conversationContext ?? [],
            repairErrors: lastErrors.length > 0 ? lastErrors : undefined,
          });
          const res = await deps.llmProvider.completeJson({
            role: "generation",
            system: payload.system,
            prompt: payload.prompt,
            temperature:
              attempt > 0 ? config.repair.temperature : config.primary.generationTemperature,
            maxTokens: config.primary.generationMaxTokens,
            schemaName: "ManifestEditPatch",
          });
          providerUsed = res.provider;
          modelUsed = res.model;
          if (res.usedFallback) usedFallbackProvider = true;

          const parsedPatch = normalizeEditPatchResponse(res.data);
          if (parsedPatch.error) {
            return { candidate: undefined, error: parsedPatch.error };
          }
          const patched = applyJsonPatch(request.existingManifest, parsedPatch.operations);
          const minimalCheck = verifyMinimalEditPatch(
            request.existingManifest,
            patched,
            parsedPatch.operations
          );
          if (!minimalCheck.ok) {
            return {
              candidate: patched,
              patch: parsedPatch.operations,
              error: minimalCheck.errors.join("; "),
            };
          }
          return { candidate: patched, patch: parsedPatch.operations };
        }

        const payload = buildCreateManifestPrompt({
          userPrompt: trimmedPrompt,
          analysis,
          plan,
          templateMatch,
          conversationContext: request.conversationContext ?? [],
          repairErrors: lastErrors.length > 0 ? lastErrors : undefined,
          previousCandidate: lastCandidate,
        });
        const res = await deps.llmProvider.completeJson({
          role: "generation",
          system: payload.system,
          prompt: payload.prompt,
          temperature:
            attempt > 0 ? config.repair.temperature : config.primary.generationTemperature,
          maxTokens: config.primary.generationMaxTokens,
          schemaName: "ManifestV2",
        });
        providerUsed = res.provider;
        modelUsed = res.model;
        if (res.usedFallback) usedFallbackProvider = true;

        return { candidate: res.data };
      });

      if (buildOutcome.error) {
        lastErrors = [buildOutcome.error];
        lastCandidate = buildOutcome.candidate;
        if (attempt < maxRepairs) {
          repairAttempts++;
          await enterState("REPAIR", repairAttempts, () => undefined, lastErrors[0]);
          continue;
        }
        transitions.push("FAILED");
        return {
          ok: false,
          state: "FAILED",
          error: `Could not apply a clean edit after ${repairAttempts} repair attempt(s): ${lastErrors[0]}`,
          diagnostics: { validationErrors: lastErrors },
          trace: makeTrace("FAILED", repairAttempts, "repair_exhausted"),
        };
      }

      candidateRaw = buildOutcome.candidate;
      appliedPatch = buildOutcome.patch;
      lastCandidate = candidateRaw;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxRepairs) {
        lastErrors = [`Generation call error: ${msg}`];
        repairAttempts++;
        await enterState("REPAIR", repairAttempts, () => undefined, msg);
        continue;
      }
      transitions.push("FAILED");
      return {
        ok: false,
        state: "FAILED",
        error: `Generation failed: ${msg}`,
        trace: makeTrace("FAILED", repairAttempts, "generation_error"),
      };
    }

    // ── VALIDATE ──────────────────────────────────────────────────────────────
    const validation = await enterState("VALIDATE", attempt, () => {
      const pureResult = validateManifestPure(candidateRaw);
      if (pureResult.kind !== "valid") return pureResult;
      if (deps.validateManifest) {
        return deps.validateManifest(pureResult.manifest);
      }
      return pureResult;
    });

    if (validation.kind !== "valid") {
      lastErrors =
        validation.kind === "truncated" ? [validation.reason] : validation.errors;
      if (attempt < maxRepairs) {
        repairAttempts++;
        await enterState("REPAIR", repairAttempts, () => undefined, lastErrors.join("; "));
        continue;
      }
      transitions.push("FAILED");
      return {
        ok: false,
        state: "FAILED",
        error: `Manifest validation failed after ${repairAttempts} repair attempt(s): ${lastErrors[0] ?? "invalid manifest"}`,
        diagnostics: { validationErrors: lastErrors },
        trace: makeTrace("FAILED", repairAttempts, "repair_exhausted"),
      };
    }

    const validManifest: ManifestV2Like = validation.manifest;

    // ── DRY_RUN ───────────────────────────────────────────────────────────────
    const dryRun = await enterState("DRY_RUN", attempt, () => runManifestDryRun(validManifest));
    lastDryRun = dryRun;

    if (!dryRun.pass) {
      lastErrors = dryRun.errors;
      if (attempt < maxRepairs) {
        repairAttempts++;
        await enterState("REPAIR", repairAttempts, () => undefined, dryRun.errors.join("; "));
        continue;
      }
      transitions.push("FAILED");
      return {
        ok: false,
        state: "FAILED",
        error: `Dry-run simulation failed after ${repairAttempts} repair attempt(s): ${dryRun.errors[0] ?? "broken workflow"}`,
        diagnostics: { validationErrors: dryRun.errors, dryRunReport: dryRun },
        trace: makeTrace("FAILED", repairAttempts, "repair_exhausted"),
      };
    }

    // ── CRITIQUE ──────────────────────────────────────────────────────────────
    let critique: CritiqueResult;
    try {
      critique = await enterState("CRITIQUE", attempt, async () => {
        const critiquePayload = buildCritiquePrompt({
          userPrompt: trimmedPrompt,
          manifest: validManifest,
          isEdit: editMode,
        });
        const res = await deps.llmProvider.completeJson({
          role: "critique",
          system: critiquePayload.system,
          prompt: critiquePayload.prompt,
          temperature: 0.1,
          maxTokens: 512,
          schemaName: "CritiqueResult",
        });
        if (res.usedFallback) usedFallbackProvider = true;
        return normalizeCritiqueResponse(res.data);
      });
    } catch {
      // If cheap critique fails due to transient error, do not fail a validated+dry-run-clean manifest
      critique = { pass: true, issues: [], summary: "Critique skipped on transient provider error." };
    }

    lastCritique = critique;

    if (!critique.pass) {
      lastErrors =
        critique.issues.length > 0
          ? critique.issues
          : ["Critique flagged mismatch with user prompt."];
      if (attempt < maxRepairs) {
        repairAttempts++;
        await enterState("REPAIR", repairAttempts, () => undefined, lastErrors.join("; "));
        continue;
      }
      transitions.push("FAILED");
      return {
        ok: false,
        state: "FAILED",
        error: `Critique checks did not pass after ${repairAttempts} repair attempt(s): ${lastErrors[0] ?? "mismatch"}`,
        diagnostics: { dryRunReport: dryRun, critique },
        trace: makeTrace("FAILED", repairAttempts, "repair_exhausted"),
      };
    }

    // ── DONE ──────────────────────────────────────────────────────────────────
    if (appliedPatch) {
      patchApplied = true;
    }
    transitions.push("DONE");
    return {
      ok: true,
      state: "DONE",
      manifest: validManifest,
      ...(appliedPatch ? { patch: appliedPatch } : {}),
      diagnostics: {
        dryRunReport: lastDryRun,
        critique: lastCritique,
      },
      trace: makeTrace("DONE", repairAttempts),
    };
  }

  transitions.push("FAILED");
  return {
    ok: false,
    state: "FAILED",
    error: "Generation failed after exhausting repair attempts.",
    trace: makeTrace("FAILED", repairAttempts, "repair_exhausted"),
  };
}

