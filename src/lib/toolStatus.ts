export interface ToolRequirement {
  key_id: string;
  label: string;
  help_url?: string;
}

export interface ManifestV2Like {
  permissions?: string[];
  tool?: {
    size?: "1x1" | "2x1" | "2x2" | "4x2";
    requires?: ToolRequirement[];
  };
  actions?: Array<{
    kind: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface ToolStatusOptions {
  keysMissing?: string[];
}

/**
 * Pure function to derive tool operational status from manifest and environment.
 * Returns one of:
 * - "Ready"
 * - "Needs API key: <label>"
 * - "Needs device: <permission>"
 * Never returns "Connected" unless real connection state is verified.
 */
export function getToolStatus(
  manifest?: ManifestV2Like | null,
  options?: ToolStatusOptions
): string {
  if (!manifest) {
    return "Ready";
  }

  const requirements = manifest.tool?.requires ?? [];

  if (options && options.keysMissing !== undefined) {
    if (options.keysMissing.length > 0) {
      const matched = requirements.find((r) => options.keysMissing?.includes(r.key_id));
      return `Needs API key: ${matched ? matched.label : options.keysMissing[0]}`;
    }
  } else if (requirements.length > 0) {
    return `Needs API key: ${requirements[0].label}`;
  }

  const permissions = manifest.permissions ?? [];
  if (permissions.length > 0) {
    return `Needs device: ${permissions[0]}`;
  }

  return "Ready";
}
