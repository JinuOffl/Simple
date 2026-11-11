import { z } from "zod";
import { FormStub } from "../stubs";
import type { RegistryEntry } from "../types";

const fieldSchema = z
  .object({
    name: z.string(),
    label: z.string(),
    type: z.enum(["text", "number", "email", "textarea"]).optional(),
    placeholder: z.string().optional(),
    required: z.boolean().optional(),
  })
  .strict();

const propsSchema = z
  .object({
    fields: z.array(fieldSchema).optional(),
    submit_label: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const formEntry: RegistryEntry<Props, "form"> = {
  type: "form",
  propsSchema,
  component: FormStub,
  llmDescription: `Use \`form\` to collect user input with labeled fields and a submit button.
Props:
- fields (array, optional): Each field has name, label, type ("text"|"number"|"email"|"textarea"), placeholder, required.
- submit_label (string, optional): Submit button text, default "Submit".
Wire on_click on the form or submit button to an action to process values.
Example: { type: "form", props: { fields: [{ name: "email", label: "Email", type: "email" }], submit_label: "Sign Up" } }`,
  requiredPermissions: [],
  examples: [
    { props: { fields: [{ name: "name", label: "Your Name", type: "text", required: true }], submit_label: "Save" } },
  ],
  isStub: true,
};
