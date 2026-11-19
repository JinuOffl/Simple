import { useState, useRef, useEffect } from "react";

interface MicRecorderProps {
  label: string;
  save_to?: string;
  onTranscript?: (text: string, key?: string) => void;
}

// Extend Window for vendor-prefixed SpeechRecognition
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SpeechRecognition?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webkitSpeechRecognition?: any;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any;

export function MicRecorder({ label, save_to, onTranscript }: MicRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SR | null>(null);
  const transcriptRef = useRef<string>("");

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const startRecording = () => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) {
      setError("Speech recognition not supported in this browser");
      return;
    }

    transcriptRef.current = "";
    setTranscript("");

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (e: { results: SpeechRecognitionResultList }) => {
      const result = Array.from(e.results)
        .map((r: SpeechRecognitionResult) => r[0].transcript)
        .join(" ");
      transcriptRef.current = result;
      setTranscript(result);
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (transcriptRef.current) {
        onTranscript?.(transcriptRef.current, save_to);
      }
    };

    recognition.onerror = (e: { error: string }) => {
      setError(`Mic error: ${e.error}`);
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setError(null);
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setIsRecording(false);
    if (transcriptRef.current) {
      onTranscript?.(transcriptRef.current, save_to);
    }
  };

  return (
    <div className="bg-n-surface border border-n-border rounded-sm p-4 space-y-3 animate-fade-in">
      {/* Mic button */}
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          aria-label={isRecording ? "Stop recording" : `Start recording ${label}`}
          className={`
            w-14 h-14 rounded-full flex items-center justify-center border
            transition-all duration-200 active:scale-95
            ${isRecording
              ? "bg-white text-black border-white animate-pulse"
              : "bg-n-surface2 border-n-border hover:border-white text-white"
            }
          `}
        >
          {isRecording ? (
            // Stop icon
            <div className="w-3.5 h-3.5 rounded-sm bg-black" />
          ) : (
            // Mic icon
            <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2H3v2a9 9 0 008 8.94V23h2v-2.06A9 9 0 0021 12v-2h-2z" />
            </svg>
          )}
        </button>

        <p className="text-n-text2 text-xs font-mono uppercase tracking-wider">
          {isRecording ? "Recording… tap to stop" : label}
        </p>
      </div>

      {/* Live transcript preview */}
      {transcript && (
        <div className="bg-black/40 border border-n-border rounded-sm p-3 text-xs text-white/90 leading-relaxed font-mono animate-fade-in">
          {transcript}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-red-400 text-xs font-mono text-center">{error}</p>
      )}
    </div>
  );
}
