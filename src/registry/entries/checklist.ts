import { z } from "zod";
import { ChecklistAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    items: z.array(z.string()).default([]),
    allowAdd: z.boolean().optional(),
    allowDelete: z.boolean().optional(),
    allowEdit: z.boolean().optional(),
    placeholder: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const checklistEntry: RegistryEntry<Props, "checklist"> = {
  type: "checklist",
  propsSchema,
  component: ChecklistAdapter,
  llmDescription: `Use \`checklist\` to display an interactive to-do, habit tracker, or task list with full CRUD support (add, edit, delete, toggle checkboxes).
Props:
- items (string[], required): Initial array of task strings. Each becomes an interactive row.
- allowAdd (boolean, optional, default: true): Show add task input.
- allowDelete (boolean, optional, default: true): Allow deleting tasks.
- allowEdit (boolean, optional, default: true): Allow inline editing of task text.
- placeholder (string, optional): Input placeholder text.
Shows a progress bar and completion count at the bottom.
Example: { type: "checklist", props: { items: ["Buy milk", "Walk the dog", "Read a book"] } }`,
  requiredPermissions: [],
  examples: [
    { props: { items: ["Step 1: Boil water", "Step 2: Add pasta", "Step 3: Drain and serve"] } },
    { props: { items: ["Push-ups x20", "Sit-ups x20", "Plank 1 min"] } },
  ],
};
