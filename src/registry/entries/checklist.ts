import { z } from "zod";
import { ChecklistAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    items: z.array(z.string()),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const checklistEntry: RegistryEntry<Props, "checklist"> = {
  type: "checklist",
  propsSchema,
  component: ChecklistAdapter,
  llmDescription: `Use \`checklist\` to display an interactive to-do or task list with checkboxes.
Props:
- items (string[], required): Array of task strings. Each becomes a tappable checkbox row.
Shows a progress bar at the bottom.
Example: { type: "checklist", props: { items: ["Buy milk", "Walk the dog", "Read a book"] } }`,
  requiredPermissions: [],
  examples: [
    { props: { items: ["Step 1: Boil water", "Step 2: Add pasta", "Step 3: Drain and serve"] } },
    { props: { items: ["Push-ups x20", "Sit-ups x20", "Plank 1 min"] } },
  ],
};
