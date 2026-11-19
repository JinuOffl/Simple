/**
 * Image downscaling helper.
 * Downscales an image to at most `maxDimension` on its long side via canvas and exports as JPEG quality `quality`.
 */
export async function downscaleImage(
  dataUrl: string,
  maxDimension = 800,
  quality = 0.7
): Promise<string> {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof Image === "undefined") {
    return dataUrl;
  }

  if (!dataUrl || typeof dataUrl !== "string") {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    // Fallback timer so downscaling never hangs if jsdom or environment doesn't load image
    const fallbackTimer = setTimeout(() => {
      resolve(dataUrl);
    }, 200);

    img.onload = () => {
      clearTimeout(fallbackTimer);
      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (!width || !height) {
          resolve(dataUrl);
          return;
        }

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const result = canvas.toDataURL("image/jpeg", quality);
        resolve(result);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => {
      clearTimeout(fallbackTimer);
      resolve(dataUrl);
    };
    img.src = dataUrl;
  });
}
