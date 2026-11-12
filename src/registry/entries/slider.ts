import { z } from "zod";
import { SliderAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    label: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    default_value: z.number().optional(),
    save_to: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const sliderEntry: RegistryEntry<Props, "slider"> = {
  type: "slider",
  propsSchema,
  component: SliderAdapter,
  llmDescription: `Use \`slider\` to let the user pick a numeric value within a range.
Props:
- label (string, optional): Label shown above the slider.
- min (number, optional, default 0): Minimum value.
- max (number, optional, default 100): Maximum value.
- step (number, optional, default 1): Increment step.
- default_value (number, optional): Initial position.
- save_to (string, optional): App data key to persist the value.
Example: { type: "slider", props: { label: "Volume", min: 0, max: 100, default_value: 50, save_to: "volume" } }`,
  requiredPermissions: [],
  examples: [
    { props: { label: "Brightness", min: 0, max: 100, step: 5, default_value: 70, save_to: "brightness" } },
  ],
  isStub: false,
};
