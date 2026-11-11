import { z } from "zod";
import { ImageGalleryAdapter } from "../adapters";
import type { RegistryEntry } from "../types";

const propsSchema = z
  .object({
    images: z.array(z.string()).optional(),
    source: z.string().optional(),
  })
  .strict();

type Props = z.infer<typeof propsSchema>;

export const imageGalleryEntry: RegistryEntry<Props, "image_gallery"> = {
  type: "image_gallery",
  propsSchema,
  component: ImageGalleryAdapter,
  llmDescription: `Use \`image_gallery\` to display a horizontally scrollable grid of images with a lightbox.
Props:
- images (string[], optional): Array of base64 data URIs or URLs to display.
- source (string, optional): App data key name; the renderer injects the image array from app state.
Example: { type: "image_gallery", props: { source: "captured_photos" } }`,
  requiredPermissions: [],
  examples: [
    { props: { images: ["https://example.com/photo1.jpg", "https://example.com/photo2.jpg"] } },
    { props: { source: "gallery_images" } },
  ],
};
