import { z } from "zod";
import { ClockAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    timezone: z.string().optional(),
    format: z.enum(["12h", "24h"]).optional(),
    label: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const clockEntry: RegistryEntry<Props, "clock"> = {
  type: "clock",
  propsSchema,
  component: ClockAdapter,
  llmDescription: `Use \`clock\` to display a live ticking clock with date.
Props:
- timezone (string, optional): IANA timezone string e.g. "America/New_York". Defaults to device timezone.
- format ("12h" | "24h", optional, default "12h"): Time format.
- label (string, optional): City/location label shown above the time. Defaults to timezone city name.
Example: { type: "clock", props: { timezone: "Asia/Tokyo", format: "24h", label: "Tokyo" } }`,
  requiredPermissions: [],
  examples: [
    { props: {} },
    { props: { timezone: "America/New_York", label: "New York" } },
    { props: { timezone: "Europe/London", format: "24h", label: "London" } },
  ],
};
