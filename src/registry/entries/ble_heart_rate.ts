import { z } from "zod";
import { BleHeartRateAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    label: z.string().optional(),
    save_to: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const bleHeartRateEntry: RegistryEntry<Props, "ble_heart_rate"> = {
  type: "ble_heart_rate",
  propsSchema,
  component: BleHeartRateAdapter,
  llmDescription: `Use \`ble_heart_rate\` to connect to standard Bluetooth Low Energy Heart Rate monitors (0x180D).
Streams live BPM into appData[save_to] and connection state ("connected" | "disconnected") into appData[\`\${save_to}_state\`].
Requires the "bluetooth" permission.
Props:
- label (string, optional): Button/card label shown to the user e.g. "Connect Heart Rate".
- save_to (string, optional, default "bpm"): App data key to store the live pulse reading.
Example: { type: "ble_heart_rate", props: { label: "Connect Watch", save_to: "bpm" } }`,
  requiredPermissions: ["bluetooth"],
  examples: [
    { props: { label: "Connect Heart Rate", save_to: "bpm" } },
    { props: { label: "Pair Sensor" } },
  ],
  isStub: false,
};
