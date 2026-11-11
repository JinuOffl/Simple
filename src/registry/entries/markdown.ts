import { z } from "zod";
import { MarkdownStub } from "../stubs";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    content: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const markdownEntry: RegistryEntry<Props, "markdown"> = {
  type: "markdown",
  propsSchema,
  component: MarkdownStub,
  llmDescription: `Use \`markdown\` to render rich formatted text: headings, lists, bold, code blocks, links.
Props:
- content (string, optional): Markdown string to render.
Example: { type: "markdown", props: { content: "## Hello\\n- item 1\\n- item 2" } }`,
  requiredPermissions: [],
  examples: [{ props: { content: "## Welcome\nThis is **bold** text." } }],
  isStub: true,
};
