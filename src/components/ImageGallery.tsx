import { useState, useEffect, useRef } from "react";

interface ImageGalleryProps {
  images?: string[]; // base64 data URIs or URLs
  source?: string;   // app_data key name (used by renderer to inject data)
}

export function ImageGallery({ images = [] }: ImageGalleryProps) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (lightbox) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus?.();
      previousFocusRef.current = null;
    }
  }, [lightbox]);

  if (images.length === 0) {
    return (
      <div className="bg-n-surface border border-n-border rounded-sm p-6 flex flex-col items-center justify-center gap-2 min-h-[100px]">
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-n-text3" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        <p className="text-n-text3 text-[10px] font-mono uppercase tracking-wider">No images yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto scrollbar-hide animate-fade-in">
        <div className="flex gap-2.5 pb-2" style={{ minWidth: "max-content" }}>
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setLightbox(src)}
              aria-label={`View photo ${i + 1}`}
              className="flex-shrink-0 w-24 h-24 rounded-sm overflow-hidden
                         border border-n-border hover:border-white
                         transition-all duration-150 active:scale-95"
            >
              <img
                src={src}
                alt={`Image ${i + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={lightbox}
            alt="Full size"
            className="max-w-full max-h-full rounded-sm border border-n-border object-contain"
          />
          <button
            type="button"
            aria-label="Close image"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-n-text2 hover:text-white
                       border border-n-border bg-n-surface rounded-sm w-8 h-8 flex items-center justify-center font-mono text-xs"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
