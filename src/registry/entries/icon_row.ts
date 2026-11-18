import { z } from "zod";
import { IconRowAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const itemSchema = z
  .object({
    icon: z.enum(["camera", "bulb", "layers", "moon", "mic", "timer"]),
    label: z.string().optional(),
    action: z.string().optional(),
  })
  .strict();

const propsSchema = z
  .object({
    items: z.array(itemSchema).max(4),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const iconRowEntry: RegistryEntry<Props, "icon_row"> = {
  type: "icon_row",
  propsSchema,
  component: IconRowAdapter,
  llmDescription: `Use \`icon_row\` to render a 1-to-4 icon launcher row of tactile action triggers.
Props:
- items (array, max 4 items): Each item has:
  - icon ("camera" | "bulb" | "layers" | "moon" | "mic" | "timer", required): Icon symbol.
  - label (string, optional): Short text label under the icon.
  - action (string, optional): Action ID to execute when tapped.
Example: { type: "icon_row", props: { items: [{ icon: "camera", label: "Snap", action: "take_photo" }, { icon: "bulb", label: "Lights", action: "toggle_lights" }] } }`,
  requiredPermissions: [],
  examples: [
    {
      props: {
        items: [
          { icon: "camera", label: "Photo", action: "a_photo" },
          { icon: "bulb", label: "Light", action: "a_light" },
          { icon: "timer", label: "Timer", action: "a_timer" },
        ],
      },
    },
  ],
  isStub: false,
};
