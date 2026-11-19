import { z } from "zod";
import { ChatThreadAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    persona_prompt: z.string().optional(),
    initial_message: z.string().optional(),
    placeholder: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const chatThreadEntry: RegistryEntry<Props, "chat_thread"> = {
  type: "chat_thread",
  propsSchema,
  component: ChatThreadAdapter,
  llmDescription: `Use \`chat_thread\` for a multi-turn AI chat. History is kept for the current session only (not stored).
Props:
- persona_prompt (string, optional): System prompt defining the AI persona.
- initial_message (string, optional): First assistant message shown on load.
- placeholder (string, optional): Input field placeholder text.
Example: { type: "chat_thread", props: { persona_prompt: "You are a study buddy.", initial_message: "What would you like to study today?" } }`,
  requiredPermissions: [],
  examples: [
    {
      props: {
        persona_prompt: "You are a helpful journaling assistant.",
        initial_message: "How are you feeling today?",
        placeholder: "Write your thoughts…",
      },
    },
  ],
  isStub: false,
};
