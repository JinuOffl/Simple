import { z } from "zod";
import { ImageCaptureAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    label: z.string(),
    save_to: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const imageCaptureEntry: RegistryEntry<Props, "image_capture"> = {
  type: "image_capture",
  propsSchema,
  component: ImageCaptureAdapter,
  llmDescription: `Use \`image_capture\` to let the user take a photo using their camera.
Requires the "camera" permission.
Props:
- label (string, required): Button label shown to the user e.g. "Take a photo".
- save_to (string, optional): App data key to store the captured base64 image.
Example: { type: "image_capture", props: { label: "Scan Receipt", save_to: "receipt_image" } }`,
  requiredPermissions: ["camera"],
  examples: [
    { props: { label: "Take Photo" } },
    { props: { label: "Scan Document", save_to: "doc_image" } },
  ],
};
