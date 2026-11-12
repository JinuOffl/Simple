import { z } from "zod";
import { ListAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    items: z.array(z.string()).optional(),
    ordered: z.boolean().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const listEntry: RegistryEntry<Props, "list"> = {
  type: "list",
  propsSchema,
  component: ListAdapter,
  llmDescription: `Use \`list\` to display a styled bullet or numbered list.
Props:
- items (string[], optional): Array of list items.
- ordered (boolean, optional): If true, renders a numbered list; otherwise bullets.
Example: { type: "list", props: { items: ["Apple", "Banana", "Cherry"], ordered: false } }`,
  requiredPermissions: [],
  examples: [{ props: { items: ["First", "Second", "Third"], ordered: true } }],
  isStub: false,
};
