import { describe, it, expect } from "vitest";
import editChainsRaw from "../../evals/edit_chains.json?raw";
import { runEditChainsSuite, type EditChainCase } from "../../evals/suite.ts";
import { ScriptedEvalLlmProvider } from "../../evals/mockProvider.ts";
import { validateWithAppZodSchema } from "./validateBridge";

describe("Phase 3 — Edit Chains Evaluation", () => {
  const chains = JSON.parse(editChainsRaw) as EditChainCase[];

  it("contains 5 edit chains, each with exactly 6 sequential edit steps", () => {
    expect(chains.length).toBe(5);
    for (const chain of chains) {
      expect(chain.steps.length).toBe(6);
      expect(chain.id).toBeTruthy();
      expect(chain.name).toBeTruthy();
      expect(chain.initialPrompt).toBeTruthy();
      for (let i = 0; i < chain.steps.length; i++) {
        expect(chain.steps[i]!.step).toBe(i + 1);
        expect(chain.steps[i]!.prompt.length).toBeGreaterThan(5);
      }
    }
  });

  it("executes all 5 chains sequentially, each step using previous result as existingManifest", async () => {
    const summary = await runEditChainsSuite(chains, {
      llmProvider: new ScriptedEvalLlmProvider(),
      validateManifest: validateWithAppZodSchema,
      mode: "scripted",
    });

    expect(summary.totalChains).toBe(5);
    expect(summary.totalSteps).toBe(30);
    expect(summary.passedSteps).toBe(30);
    expect(summary.postRepairValidRatePct).toBe(100);
    expect(summary.failures.length).toBe(0);
    expect(summary.chains.length).toBe(5);
  });
});
