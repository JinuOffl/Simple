import { z } from "zod";
import { ChartAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const datasetSchema = z
  .object({
    label: z.string(),
    data: z.array(z.number()),
  })
  .strict();

const propsSchema = z
  .object({
    chart_type: z.enum(["bar", "line", "pie"]).optional(),
    labels: z.array(z.string()).optional(),
    datasets: z.array(datasetSchema).optional(),
    title: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const chartEntry: RegistryEntry<Props, "chart"> = {
  type: "chart",
  propsSchema,
  component: ChartAdapter,
  llmDescription: `Use \`chart\` to visualize data as a bar, line, or pie chart.
Props:
- chart_type ("bar" | "line" | "pie", optional, default "bar"): Chart style.
- labels (string[], optional): X-axis or slice labels.
- datasets (array, optional): Each has label (string) and data (number[]).
- title (string, optional): Chart title.
Example: { type: "chart", props: { chart_type: "bar", labels: ["Mon","Tue","Wed"], datasets: [{ label: "Steps", data: [5000,8000,6000] }] } }`,
  requiredPermissions: [],
  examples: [
    {
      props: {
        chart_type: "line",
        labels: ["Jan", "Feb", "Mar"],
        datasets: [{ label: "Sales", data: [120, 200, 150] }],
        title: "Monthly Sales",
      },
    },
  ],
  isStub: false,
};
