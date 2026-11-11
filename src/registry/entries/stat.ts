import { z } from "zod";
import { StatStub } from "../stubs";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    label: z.string().optional(),
    value: z.union([z.string(), z.number()]).optional(),
    unit: z.string().optional(),
    description: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const statEntry: RegistryEntry<Props, "stat"> = {
  type: "stat",
  propsSchema,
  component: StatStub,
  llmDescription: `Use \`stat\` to display a single key metric or KPI in a large, prominent style.
Props:
- label (string, optional): Metric name e.g. "Steps Today".
- value (string | number, optional): The metric value e.g. 8423.
- unit (string, optional): Unit suffix e.g. "km", "%", "°C".
- description (string, optional): Small subtitle or context.
Example: { type: "stat", props: { label: "Heart Rate", value: 72, unit: "bpm" } }`,
  requiredPermissions: [],
  examples: [
    { props: { label: "Temperature", value: 24, unit: "°C", description: "Feels like 26°C" } },
  ],
  isStub: true,
};
