import { useState } from "react";

interface ImageGalleryProps {
  images?: string[]; // base64 data URIs or URLs
  source?: string;   // app_data key name (used by renderer to inject data)
}

export function ImageGallery({ images = [] }: ImageGalleryProps) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (images.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 flex flex-col items-center justify-center gap-2 min-h-[100px]">
        <svg viewBox="0 0 24 24" className="w-8 h-8 text-white/20" fill="currentColor">
          <path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm16 2H4v8l4-4 4 5 3-3 5 6V6zm-2 2a1 1 0 110 2 1 1 0 010-2z" />
        </svg>
        <p className="text-white/30 text-xs">No images yet</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto scrollbar-hide animate-fade-in">
        <div className="flex gap-3 pb-2" style={{ minWidth: "max-content" }}>
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => setLightbox(src)}
              className="flex-shrink-0 w-28 h-28 rounded-2xl overflow-hidden
                         border border-white/10 hover:border-primary-400/50
                         transition-all duration-200 active:scale-95"
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
        >
          <img
            src={lightbox}
            alt="Full size"
            className="max-w-full max-h-full rounded-2xl object-contain"
          />
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white
                       bg-white/10 rounded-full w-10 h-10 flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      )}
    </>
  );
}
