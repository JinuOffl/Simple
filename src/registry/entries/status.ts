import { z } from "zod";
import { StatusAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    label: z.string(),
    state: z.enum(["ok", "warn", "off"]).optional(),
    bind: z.never().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const statusEntry: RegistryEntry<Props, "status"> = {
  type: "status",
  propsSchema,
  component: StatusAdapter,
  llmDescription: `Use \`status\` to display an operational badge with state icon (check-circle, warning, or off).
Props:
- label (string): Status text to display. Note that if node.bind is set, string bindValue overrides label.
- state ("ok" | "warn" | "off", optional, default "ok"): Operational state variant.
Example: { type: "status", props: { label: "System Ready", state: "ok" } }`,
  requiredPermissions: [],
  examples: [
    {
      props: {
        label: "Connected to Sensors",
        state: "ok",
      },
    },
    {
      props: {
        label: "Service Offline",
        state: "warn",
      },
    },
  ],
  isStub: false,
};
