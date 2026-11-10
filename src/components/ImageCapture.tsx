import { useState, useRef } from "react";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";

interface ImageCaptureProps {
  label: string;
  save_to?: string; // app_data key
  onCapture?: (base64: string, key?: string) => void;
}

export function ImageCapture({ label, save_to, onCapture }: ImageCaptureProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCapture = async () => {
    setLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        // Native: use Capacitor Camera plugin
        const photo = await Camera.getPhoto({
          quality: 85,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Camera,
        });
        const base64 = `data:image/jpeg;base64,${photo.base64String}`;
        setPreview(base64);
        onCapture?.(base64, save_to);
      } else {
        // Web fallback: trigger file input
        fileRef.current?.click();
      }
    } catch (e) {
      console.error("Camera error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setPreview(base64);
      onCapture?.(base64, save_to);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3 animate-fade-in">
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileRef}
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Preview */}
      {preview ? (
        <div className="relative rounded-2xl overflow-hidden border border-white/10">
          <img src={preview} alt="Captured" className="w-full h-48 object-cover" />
          <button
            onClick={handleCapture}
            className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm
                       text-white text-xs font-medium rounded-xl px-3 py-1.5
                       border border-white/20 hover:bg-black/80 transition-all"
          >
            Retake
          </button>
        </div>
      ) : (
        <button
          onClick={handleCapture}
          disabled={loading}
          className="w-full h-36 glass rounded-2xl border-2 border-dashed border-white/20
                     hover:border-primary-400/60 hover:bg-white/5
                     flex flex-col items-center justify-center gap-3
                     transition-all duration-200 active:scale-[0.98]
                     disabled:opacity-50"
        >
          {loading ? (
            <div className="flex gap-1">
              <span className="loading-dot" />
              <span className="loading-dot" />
              <span className="loading-dot" />
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-primary-500/20 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.776 48.776 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-white/70 text-sm font-medium">{label}</p>
                <p className="text-white/30 text-xs mt-0.5">Tap to open camera</p>
              </div>
            </>
          )}
        </button>
      )}
    </div>
  );
}
