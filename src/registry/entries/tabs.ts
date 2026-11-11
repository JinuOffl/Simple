import { z } from "zod";
import { TabsStub } from "../stubs";
import type { RegistryEntry } from "../types";

const tabSchema = z
  .object({
    label: z.string(),
    screen_id: z.string(),
  })
  .strict();

const propsSchema = z
  .object({
    tabs: z.array(tabSchema).optional(),
    default_tab: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const tabsEntry: RegistryEntry<Props, "tabs"> = {
  type: "tabs",
  propsSchema,
  component: TabsStub,
  llmDescription: `Use \`tabs\` to create a tabbed navigation bar that switches between screens.
Props:
- tabs (array, optional): Each tab has label (string) and screen_id (string referencing a screen in the manifest).
- default_tab (string, optional): screen_id of the initially active tab.
Example: { type: "tabs", props: { tabs: [{ label: "Home", screen_id: "home" }, { label: "Profile", screen_id: "profile" }] } }`,
  requiredPermissions: [],
  examples: [
    {
      props: {
        tabs: [
          { label: "Dashboard", screen_id: "dashboard" },
          { label: "Settings", screen_id: "settings" },
        ],
        default_tab: "dashboard",
      },
    },
  ],
  isStub: true,
};
