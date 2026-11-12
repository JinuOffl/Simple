import type { z } from "zod";
import type { ComponentType } from "react";

export type Permission = "camera" | "microphone" | "location" | "contacts" | "notifications";

export interface RegistryRenderContext {
  nodeId: string;
  bindValue?: unknown;
  appData: Record<string, unknown>;
  appId?: string;
  isPreview?: boolean;
  isLoading?: boolean;
  onClickActionId?: string;
  onDataChange?: (key: string, value: unknown) => void;
  onAction?: (extraAppData?: Record<string, unknown>) => void | Promise<void>;
  onNavigateScreen?: (screenId: string) => void;
}

export interface RegistryEntry<
  TProps extends Record<string, unknown> = Record<string, unknown>,
  TType extends string = string,
> {
  /** Must match the Zod discriminant and the ManifestRenderer switch key */
  type: TType;
  /** Zod schema for this component's props — STRICT (no .passthrough()) */
  propsSchema: z.ZodType<TProps>;
  /** The React component to render */
  component: ComponentType<
    TProps & {
      id: string;
      bindValue?: unknown;
      onAction?: () => void | Promise<void>;
      ctx?: RegistryRenderContext;
    }
  >;
  /** Used to build the LLM generator prompt. Describe: when to use, available props, example. */
  llmDescription: string;
  /** Native permissions this component requires at runtime */
  requiredPermissions: Permission[];
  /** Example props for tests and LLM few-shots */
  examples: Array<{ props: TProps }>;
  /** If true, this component is a stub — it renders a placeholder, not yet fully implemented */
  isStub?: boolean;
}
