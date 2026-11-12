import { z } from "zod";
import { TimerAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    duration_seconds: z.number().int().positive().optional(),
    label: z.string().optional(),
    auto_start: z.boolean().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const timerEntry: RegistryEntry<Props, "timer"> = {
  type: "timer",
  propsSchema,
  component: TimerAdapter,
  llmDescription: `Use \`timer\` to display a countdown timer with start/pause/reset controls.
Props:
- duration_seconds (number, optional): Countdown duration in seconds.
- label (string, optional): Label displayed above the timer e.g. "Rest Period".
- auto_start (boolean, optional): If true, starts counting immediately on mount.
Example: { type: "timer", props: { duration_seconds: 60, label: "Round 1" } }`,
  requiredPermissions: [],
  examples: [
    { props: { duration_seconds: 300, label: "Work Session", auto_start: false } },
  ],
  isStub: false,
};
