import { z } from "zod";
import { CardAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    title: z.string().optional(),
    body: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const cardEntry: RegistryEntry<Props, "card"> = {
  type: "card",
  propsSchema,
  component: CardAdapter,
  llmDescription: `Use \`card\` to display a labeled info block with a small title and body text.
Props:
- title (string, optional): Small uppercase label shown above the body.
- body (string, optional): The main content text.
Example: { type: "card", props: { title: "Result", body: "42 degrees Celsius" } }`,
  requiredPermissions: [],
  examples: [
    { props: { title: "Weather", body: "Sunny, 24°C" } },
    { props: { body: "No title, just content." } },
  ],
};
