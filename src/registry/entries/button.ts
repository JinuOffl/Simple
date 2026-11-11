import { z } from "zod";
import { ButtonAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    label: z.string(),
    loading: z.boolean().optional(),
    disabled: z.boolean().optional(),
    variant: z.enum(["primary", "ghost"]).optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const buttonEntry: RegistryEntry<Props, "button"> = {
  type: "button",
  propsSchema,
  component: ButtonAdapter,
  llmDescription: `Use \`button\` to trigger an action when tapped.
Props:
- label (string, required): The button text (displayed uppercase).
- variant ("primary" | "ghost", optional, default "primary"): Visual style.
- loading (boolean, optional): Shows a loading spinner.
- disabled (boolean, optional): Disables the button.
Wire up an on_click to an action id.
Example: { type: "button", id: "btn1", props: { label: "Submit" }, on_click: "action1" }`,
  requiredPermissions: [],
  examples: [
    { props: { label: "Get Started" } },
    { props: { label: "Cancel", variant: "ghost" } },
    { props: { label: "Loading…", loading: true } },
  ],
};
