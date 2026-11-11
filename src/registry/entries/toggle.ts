import { z } from "zod";
import { ToggleStub } from "../stubs";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    label: z.string().optional(),
    default_value: z.boolean().optional(),
    save_to: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const toggleEntry: RegistryEntry<Props, "toggle"> = {
  type: "toggle",
  propsSchema,
  component: ToggleStub,
  llmDescription: `Use \`toggle\` to let the user switch a boolean setting on/off.
Props:
- label (string, optional): Description label next to the toggle.
- default_value (boolean, optional): Initial on/off state.
- save_to (string, optional): App data key to persist the toggle value.
Example: { type: "toggle", props: { label: "Enable notifications", save_to: "notif_enabled" } }`,
  requiredPermissions: [],
  examples: [
    { props: { label: "Dark mode", default_value: false, save_to: "dark_mode" } },
  ],
  isStub: true,
};
