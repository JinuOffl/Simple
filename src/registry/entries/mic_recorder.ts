import { z } from "zod";
import { MicRecorderAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    label: z.string(),
    save_to: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const micRecorderEntry: RegistryEntry<Props, "mic_recorder"> = {
  type: "mic_recorder",
  propsSchema,
  component: MicRecorderAdapter,
  llmDescription: `Use \`mic_recorder\` to let the user record voice and get a text transcript via speech recognition.
Requires the "microphone" permission.
Props:
- label (string, required): Prompt shown to the user e.g. "Tap to record your note".
- save_to (string, optional): App data key to store the transcript string.
Example: { type: "mic_recorder", props: { label: "Record your note", save_to: "note_text" } }`,
  requiredPermissions: ["microphone"],
  examples: [
    { props: { label: "Speak your answer" } },
    { props: { label: "Record symptom description", save_to: "symptom_transcript" } },
  ],
};
