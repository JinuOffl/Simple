import { z } from "zod";
import { ChatBubbleAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const chatBubbleEntry: RegistryEntry<Props, "chat_bubble"> = {
  type: "chat_bubble",
  propsSchema,
  component: ChatBubbleAdapter,
  llmDescription: `Use \`chat_bubble\` to render a single chat message bubble (static display).
Props:
- role ("user" | "assistant", required): Determines alignment and style.
- content (string, required): The message text.
For a live interactive chat, use \`conversation_loop\` instead.
Example: { type: "chat_bubble", props: { role: "assistant", content: "Hello! How can I help?" } }`,
  requiredPermissions: [],
  examples: [
    { props: { role: "assistant", content: "Hi there! I'm your assistant." } },
    { props: { role: "user", content: "What's the weather like?" } },
  ],
};
