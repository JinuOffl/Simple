import { z } from "zod";
import { TableAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    columns: z.array(z.string()).optional(),
    rows: z.array(z.array(z.string())).optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const tableEntry: RegistryEntry<Props, "table"> = {
  type: "table",
  propsSchema,
  component: TableAdapter,
  llmDescription: `Use \`table\` to display tabular data with headers and rows.
Props:
- columns (string[], optional): Column header names.
- rows (string[][], optional): Array of row arrays; each inner array must match column count.
Example: { type: "table", props: { columns: ["Name","Score"], rows: [["Alice","95"],["Bob","87"]] } }`,
  requiredPermissions: [],
  examples: [{ props: { columns: ["Item", "Price"], rows: [["Coffee", "$3"], ["Tea", "$2"]] } }],
  isStub: false,
};
