import { z } from "zod";
import type { RegistryEntry } from "./types";

import { textEntry } from "./entries/text";
import { cardEntry } from "./entries/card";
import { buttonEntry } from "./entries/button";
import { checklistEntry } from "./entries/checklist";
import { calculatorEntry } from "./entries/calculator";
import { clockEntry } from "./entries/clock";
import { imageCaptureEntry } from "./entries/image_capture";
import { imageGalleryEntry } from "./entries/image_gallery";
import { micRecorderEntry } from "./entries/mic_recorder";
import { mcqQuizEntry } from "./entries/mcq_quiz";
import { chatBubbleEntry } from "./entries/chat_bubble";
import { conversationLoopEntry } from "./entries/conversation_loop";

import { markdownEntry } from "./entries/markdown";
import { listEntry } from "./entries/list";
import { tableEntry } from "./entries/table";
import { formEntry } from "./entries/form";
import { chartEntry } from "./entries/chart";
import { statEntry } from "./entries/stat";
import { toggleEntry } from "./entries/toggle";
import { sliderEntry } from "./entries/slider";
import { timerEntry } from "./entries/timer";
import { tabsEntry } from "./entries/tabs";
import { chatThreadEntry } from "./entries/chat_thread";

export type {
  Permission,
  RegistryEntry,
  RegistryRenderContext,
} from "./types";

function widenEntry<TProps extends Record<string, unknown>, TType extends string>(
  entry: RegistryEntry<TProps, TType>
): RegistryEntry<Record<string, unknown>, TType> {
  return entry as unknown as RegistryEntry<Record<string, unknown>, TType>;
}

export const COMPONENT_REGISTRY = [
  // 12 existing components
  widenEntry(textEntry),
  widenEntry(cardEntry),
  widenEntry(buttonEntry),
  widenEntry(checklistEntry),
  widenEntry(calculatorEntry),
  widenEntry(clockEntry),
  widenEntry(imageCaptureEntry),
  widenEntry(imageGalleryEntry),
  widenEntry(micRecorderEntry),
  widenEntry(mcqQuizEntry),
  widenEntry(chatBubbleEntry),
  widenEntry(conversationLoopEntry),

  // 11 expanded v2 components (implemented in Phase 5)
  widenEntry(markdownEntry),
  widenEntry(listEntry),
  widenEntry(tableEntry),
  widenEntry(formEntry),
  widenEntry(chartEntry),
  widenEntry(statEntry),
  widenEntry(toggleEntry),
  widenEntry(sliderEntry),
  widenEntry(timerEntry),
  widenEntry(tabsEntry),
  widenEntry(chatThreadEntry),
] as const;

export type RegistryComponentType = (typeof COMPONENT_REGISTRY)[number]["type"];

/** Look up a registry entry by component type. Returns undefined if not found. */
export function getRegistryEntry(type: string): RegistryEntry | undefined {
  return COMPONENT_REGISTRY.find((e) => e.type === type);
}

/** All valid component type strings — derived from registry, never hand-maintained. */
export const VALID_COMPONENT_TYPES = new Set(COMPONENT_REGISTRY.map((e) => e.type));

/** Build the LLM generator prompt section from the registry. */
export function buildRegistryPrompt(): string {
  return COMPONENT_REGISTRY
    .filter((e) => !e.isStub)
    .map((e) => `### ${e.type}\n${e.llmDescription}`)
    .join("\n\n");
}

/**
 * Derive a strict Zod discriminated union schema of manifest nodes directly from
 * COMPONENT_REGISTRY so every node variant's `props` matches its component's propsSchema.
 */
export function buildRegistryNodeSchema() {
  const variants = COMPONENT_REGISTRY.map((entry) =>
    z.object({
      id: z.string(),
      type: z.literal(entry.type),
      props: entry.propsSchema.optional(),
      bind: z.string().optional(),
      on_click: z.string().optional(),
    })
  );

  const [first, ...rest] = variants;
  if (!first) {
    throw new Error("COMPONENT_REGISTRY must contain at least one entry");
  }
  return z.discriminatedUnion("type", [first, ...rest]);
}
