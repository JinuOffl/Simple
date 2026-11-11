import { z } from "zod";
import { McqQuizAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const mcqQuestionSchema = z
  .object({
    question: z.string(),
    options: z.array(z.string()),
    correct_index: z.number().int().nonnegative(),
  })
  .strict();

const propsSchema = z
  .object({
    questions: z.array(mcqQuestionSchema),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const mcqQuizEntry: RegistryEntry<Props, "mcq_quiz"> = {
  type: "mcq_quiz",
  propsSchema,
  component: McqQuizAdapter,
  llmDescription: `Use \`mcq_quiz\` to display a multiple-choice quiz with scored answers.
Props:
- questions (array, required): Each item has:
  - question (string): The question text.
  - options (string[]): 2-6 answer choices.
  - correct_index (number): Zero-based index of the correct answer.
Shows score and retry after submission.
Example: { type: "mcq_quiz", props: { questions: [{ question: "Capital of France?", options: ["Berlin","Paris","Madrid"], correct_index: 1 }] } }`,
  requiredPermissions: [],
  examples: [
    {
      props: {
        questions: [
          { question: "What is 2 + 2?", options: ["3", "4", "5"], correct_index: 1 },
          { question: "Sky color?", options: ["Red", "Blue", "Green"], correct_index: 1 },
        ],
      },
    },
  ],
};
