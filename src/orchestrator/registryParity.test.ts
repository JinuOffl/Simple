import { describe, it, expect } from "vitest";
import { COMPONENT_REGISTRY } from "@/registry/index";
import { validateManifestV2 } from "@/schema/validator";
import { LLM_CONFIG } from "@/config/llm";
import { DEFAULT_LLM_CONFIG } from "../../supabase/functions/_shared/orchestrator/llmConfig.ts";
import { REGISTRY_CAPABILITY_META } from "../../supabase/functions/_shared/orchestrator/registrySpec.ts";
import { STARTER_TEMPLATES } from "../../supabase/functions/_shared/orchestrator/templates.ts";

describe("orchestrator metadata & template parity", () => {
  it("REGISTRY_CAPABILITY_META matches COMPONENT_REGISTRY 1:1 (types, permissions, stubs, props)", () => {
    expect(REGISTRY_CAPABILITY_META.length).toBe(COMPONENT_REGISTRY.length);
    expect(REGISTRY_CAPABILITY_META.length).toBe(27);

    const metaMap = new Map(REGISTRY_CAPABILITY_META.map((e) => [e.type, e] as const));

    for (const reg of COMPONENT_REGISTRY) {
      const res = reg.propsSchema.safeParse({});
      const derived: string[] = [];
      if (!res.success) {
        for (const issue of res.error.issues) {
          if (issue.path.length === 1 && typeof issue.path[0] === "string") {
            derived.push(issue.path[0]);
          }
        }
      }
      const derivedRequiredKeys = Array.from(new Set(derived)).sort();

      const meta = metaMap.get(reg.type);
      expect(meta, `Missing metadata entry for "${reg.type}"`).toBeDefined();
      expect([...(meta?.requiredPermissions ?? [])].sort()).toEqual(
        [...reg.requiredPermissions].sort()
      );
      expect(Boolean(meta?.isStub)).toBe(Boolean(reg.isStub));

      // Parity check: requiredPropKeys derived from Zod safeParse({}) matches registrySpec
      expect(
        [...(meta?.requiredPropKeys ?? [])].sort(),
        `requiredPropKeys mismatch for "${reg.type}"`
      ).toEqual(derivedRequiredKeys);

      // Verify exampleProps satisfies the canonical Zod propsSchema
      const parsed = reg.propsSchema.safeParse(meta?.exampleProps);
      expect(
        parsed.success,
        `exampleProps for "${reg.type}" failed strict Zod propsSchema`
      ).toBe(true);
    }
  });

  it("all curated STARTER_TEMPLATES pass canonical 27-component ManifestV2 validation", () => {
    expect(STARTER_TEMPLATES.length).toBeGreaterThanOrEqual(7);
    for (const tpl of STARTER_TEMPLATES) {
      const res = validateManifestV2(tpl.manifest);
      expect(
        res.kind,
        `Starter template "${tpl.slug}" invalid: ${
          res.kind === "invalid" ? res.errors.join("; ") : ""
        }`
      ).toBe("valid");
    }
  });

  it("LLM_CONFIG re-exports shared DEFAULT_LLM_CONFIG with primary and fallback endpoints", () => {
    expect(LLM_CONFIG).toBe(DEFAULT_LLM_CONFIG);
    expect(LLM_CONFIG.primary.provider).toBe("groq");
    expect(LLM_CONFIG.primary.generationModel.length).toBeGreaterThan(0);
    expect(LLM_CONFIG.primary.critiqueModel.length).toBeGreaterThan(0);
    expect(LLM_CONFIG.primary.runtimeModel.length).toBeGreaterThan(0);
    expect(LLM_CONFIG.fallback.provider).toBe("openai-compatible");
    expect(LLM_CONFIG.repair.maxAttempts).toBe(2);
  });
});

