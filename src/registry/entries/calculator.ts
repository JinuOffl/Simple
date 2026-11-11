import { z } from "zod";
import { CalculatorAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

// Calculator has no configurable props — it's fully self-contained
const propsSchema = z.object({}).strict();

type Props = z.infer<typeof propsSchema>;

export const calculatorEntry: RegistryEntry<Props, "calculator"> = {
  type: "calculator",
  propsSchema,
  component: CalculatorAdapter,
  llmDescription: `Use \`calculator\` to embed a fully functional arithmetic calculator.
No props required. Self-contained: supports +, -, ×, ÷, %, +/-, backspace, and clear.
Example: { type: "calculator", props: {} }`,
  requiredPermissions: [],
  examples: [
    { props: {} },
  ],
};
