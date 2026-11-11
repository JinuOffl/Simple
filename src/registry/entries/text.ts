import { z } from "zod";
import { TextAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    content: z.string().optional(),
    className: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const textEntry: RegistryEntry<Props, "text"> = {
  type: "text",
  propsSchema,
  component: TextAdapter,
  llmDescription: `Use \`text\` to display a paragraph of plain text.
Props:
- content (string, optional when bound via \`bind\`): The text to display.
- className (string, optional): Extra Tailwind classes.
Example: { type: "text", props: { content: "Hello, world!" } }`,
  requiredPermissions: [],
  examples: [
    { props: { content: "Welcome to the app!" } },
    { props: { content: "This is a description paragraph.", className: "text-center" } },
  ],
};
