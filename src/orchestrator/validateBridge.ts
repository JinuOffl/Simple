import { validateManifestV2 } from "@/schema/validator";
import type {
  ManifestV2Like,
  ValidationResult,
} from "../../supabase/functions/_shared/orchestrator/types.ts";

/**
 * Bridge connecting the pure shared orchestrator (`VALIDATE` stage) to the
 * canonical React/Zod 26-component `ManifestV2Schema` validator in `src/schema/validator.ts`.
 */
export function validateWithAppZodSchema(raw: unknown): ValidationResult {
  const result = validateManifestV2(raw);
  if (result.kind === "valid") {
    return {
      kind: "valid",
      manifest: result.manifest as unknown as ManifestV2Like,
    };
  }
  return result;
}

