import { z } from "zod";
import { ConversationLoopAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    persona_prompt: z.string(),
    actionId: z.string().optional(),
    appId: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const conversationLoopEntry: RegistryEntry<Props, "conversation_loop"> = {
  type: "conversation_loop",
  propsSchema,
  component: ConversationLoopAdapter,
  llmDescription: `Use \`conversation_loop\` to embed a full interactive AI chat interface.
The user can type or use voice input; the AI responds in character.
Props:
- persona_prompt (string, required): System prompt defining the AI's persona and behavior.
- actionId (string, optional): The id of the conversation_loop action in the manifest (defaults to node id).
- appId (string, optional): App id for multiplayer/session context.
Example: { type: "conversation_loop", props: { persona_prompt: "You are a helpful cooking assistant." } }`,
  requiredPermissions: ["microphone"],
  examples: [
    {
      props: {
        persona_prompt: "You are a friendly fitness coach. Keep responses short and motivating.",
        actionId: "coach_action",
      },
    },
  ],
};
