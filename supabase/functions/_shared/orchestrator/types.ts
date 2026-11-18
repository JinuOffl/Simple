/**
 * Pure TypeScript definitions for the Simple v2 generation orchestrator.
 * Zero framework/runtime globals so this module runs identically in Deno Edge
 * Functions, Vite/Vitest, and Node evals.
 */

export type OrchestratorState =
  | "RECEIVE"
  | "TEMPLATE_MATCH"
  | "ANALYZE"
  | "RESOLVE"
  | "BUILD"
  | "VALIDATE"
  | "DRY_RUN"
  | "CRITIQUE"
  | "REPAIR"
  | "DONE"
  | "FAILED";

export type Permission =
  | "camera"
  | "microphone"
  | "location"
  | "contacts"
  | "notifications";

export type ActionKind =
  | "llm_call"
  | "local_compute"
  | "api_fetch"
  | "mcp_call"
  | "navigate"
  | "save_data"
  | "record_insert"
  | "record_update"
  | "conversation_loop";

export type CreditCostClass =
  | "local"
  | "api_fetch"
  | "mcp_call"
  | "runtime_llm"
  | "generation"
  | "critique"
  | "sandbox_exec";

export interface ManifestNodeLike {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  bind?: string;
  on_click?: string;
}

export interface ManifestScreenLike {
  id: string;
  title: string;
  nodes: ManifestNodeLike[];
}

export interface ManifestConnectorLike {
  connector_id: string;
  tools: string[];
}

export interface ManifestFieldLike {
  name: string;
  type: "string" | "number" | "boolean" | "date" | "json" | "image_ref";
  required?: boolean;
}

export interface ManifestCollectionLike {
  name: string;
  fields: ManifestFieldLike[];
}

export interface ManifestActionLike {
  id: string;
  kind: ActionKind;
  prompt_template?: string;
  persona_prompt?: string;
  operation?: string;
  api?: string;
  params?: Record<string, unknown>;
  connector_id?: string;
  tool_name?: string;
  collection?: string;
  input_from?: string[];
  render_result_into?: string;
  output_key?: string;
  credit_cost_class?: CreditCostClass;
}

export type ToolSize = "1x1" | "2x1" | "2x2" | "4x2";

export interface ToolRequirementLike {
  key_id: string;
  label: string;
  help_url?: string;
}

export interface ToolMetaLike {
  size: ToolSize;
  requires?: ToolRequirementLike[];
}

export interface ManifestV2Like {
  schema_version: 2;
  app_id: string;
  name: string;
  icon: string;
  description?: string;
  permissions: Permission[];
  connectors: ManifestConnectorLike[];
  data: {
    collections: ManifestCollectionLike[];
  };
  screens: ManifestScreenLike[];
  actions: ManifestActionLike[];
  multiplayer?: {
    enabled: boolean;
    default_role?: "editor" | "viewer";
    shared_collections?: string[];
  };
  tool?: {
    size: "1x1" | "2x1" | "2x2" | "4x2";
    requires?: Array<{ key_id: string; label: string; help_url?: string }>;
  };
}

export interface JsonPatchOperation {
  op: "add" | "remove" | "replace" | "move" | "copy" | "test";
  path: string;
  from?: string;
  value?: unknown;
}

export type ValidationResult =
  | { kind: "valid"; manifest: ManifestV2Like }
  | { kind: "invalid"; errors: string[] }
  | { kind: "truncated"; reason: string };

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export type LlmRole = "generation" | "critique" | "runtime";

export interface LlmJsonRequest {
  role: LlmRole;
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  /** Optional hint to request JSON Schema structured output when provider supports it. */
  schemaName?: string;
}

export interface LlmJsonResponse<T = unknown> {
  data: T;
  rawText: string;
  provider: string;
  model: string;
  usedFallback: boolean;
  latencyMs: number;
}

export interface LLMProvider {
  readonly name: string;
  completeJson<T = unknown>(request: LlmJsonRequest): Promise<LlmJsonResponse<T>>;
}

export interface StarterTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  tags: string[];
  keywords: string[];
  manifest: ManifestV2Like;
}

export interface TemplateMatch {
  templateId: string;
  slug: string;
  name: string;
  score: number;
  matchedTags: string[];
  manifest: ManifestV2Like;
}

export interface TemplateMatcher {
  findBestMatch(
    prompt: string,
    extraTemplates?: StarterTemplate[]
  ): Promise<TemplateMatch | null>;
}

export interface UnsupportedFeatureFinding {
  feature: string;
  reason: string;
  alternative: string;
}

export interface PromptAnalysis {
  intent: string;
  isEdit: boolean;
  requestedFeatures: string[];
  unsupportedRequests: UnsupportedFeatureFinding[];
  suggestedApis: string[];
  suggestedConnectors: Array<{ connectorId: string; tools: string[] }>;
  suggestedComponents: string[];
  suggestedPermissions: Permission[];
  screenHints: string[];
  multiplayerRequested: boolean;
}

export interface ResolvedPlan {
  supported: boolean;
  honestyMessage?: string;
  closestAlternative?: string;
  templateSlug?: string;
  components: string[];
  permissions: Permission[];
  connectors: ManifestConnectorLike[];
  apis: string[];
  requiresRuntimeLlm: boolean;
  notes: string[];
  toolRequirements?: ToolRequirementLike[];
}

export interface DryRunReport {
  pass: boolean;
  errors: string[];
  warnings: string[];
  visitedScreens: string[];
  exercisedActions: string[];
}

export interface CritiqueResult {
  pass: boolean;
  issues: string[];
  summary?: string;
}

export interface StateTiming {
  state: OrchestratorState;
  attempt: number;
  durationMs: number;
  note?: string;
}

export interface GenerationTrace {
  finalState: "DONE" | "FAILED";
  failureKind?: "invalid_input" | "unsupported" | "generation_error" | "repair_exhausted";
  transitions: OrchestratorState[];
  stateTimings: StateTiming[];
  totalLatencyMs: number;
  repairAttempts: number;
  templateMatch: {
    matched: boolean;
    slug?: string;
    score?: number;
  };
  providerUsed?: string;
  modelUsed?: string;
  usedFallbackProvider: boolean;
  editMode: boolean;
  patchApplied: boolean;
}

export interface GenerateRequest {
  userPrompt: string;
  existingManifest?: ManifestV2Like;
  conversationContext?: ConversationTurn[];
  extraTemplates?: StarterTemplate[];
}

export interface GenerationResult {
  ok: boolean;
  state: "DONE" | "FAILED";
  manifest?: ManifestV2Like;
  patch?: JsonPatchOperation[];
  unsupported?: {
    message: string;
    alternative: string;
  };
  error?: string;
  diagnostics?: {
    validationErrors?: string[];
    dryRunReport?: DryRunReport;
    critique?: CritiqueResult;
    rawCandidate?: unknown;
  };
  trace: GenerationTrace;
}

