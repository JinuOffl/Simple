import { z } from "zod";
import { HeatmapAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    rows: z.array(z.string()),
    days: z.number().int().min(1).max(31).optional(),
    save_to: z.string().optional(),
    title: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const heatmapEntry: RegistryEntry<Props, "heatmap"> = {
  type: "heatmap",
  propsSchema,
  component: HeatmapAdapter,
  llmDescription: `Use \`heatmap\` to embed a toggleable habit or frequency grid across days.
Props:
- rows (string[]): Names of items/habits to track on the vertical axis (e.g. ["Workout", "Water", "Reading"]).
- days (number, optional, default 14, max 31): Number of days displayed on horizontal axis.
- save_to (string, optional): Key in app data to persist cell states.
- title (string, optional): Header title for the heatmap widget.
Example: { type: "heatmap", props: { rows: ["Workout", "Reading"], days: 14, title: "Daily Habits" } }`,
  requiredPermissions: [],
  examples: [
    {
      props: {
        rows: ["Workout", "Reading", "Meditate"],
        days: 14,
        title: "Habit Tracker",
        save_to: "habits_grid",
      },
    },
  ],
  isStub: false,
};
