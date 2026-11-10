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

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (e: { results: SpeechRecognitionResultList }) => {
      const result = Array.from(e.results)
        .map((r: SpeechRecognitionResult) => r[0].transcript)
        .join(" ");
      setTranscript(result);
    };

    recognition.onend = () => {
      setIsRecording(false);
      if (transcript) {
        onTranscript?.(transcript, save_to);
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
    if (transcript) {
      onTranscript?.(transcript, save_to);
    }
  };

  return (
    <div className="glass rounded-2xl p-4 space-y-3 animate-fade-in">
      {/* Mic button */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`
            w-16 h-16 rounded-full flex items-center justify-center
            transition-all duration-300 active:scale-90
            ${isRecording
              ? "bg-red-500 shadow-[0_0_24px_rgba(239,68,68,0.5)] animate-pulse-slow"
              : "bg-primary-600 hover:bg-primary-500 shadow-glow"
            }
          `}
        >
          {isRecording ? (
            // Stop icon
            <div className="w-4 h-4 rounded-sm bg-white" />
          ) : (
            // Mic icon
            <svg viewBox="0 0 24 24" className="w-7 h-7 text-white" fill="currentColor">
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2H3v2a9 9 0 008 8.94V23h2v-2.06A9 9 0 0021 12v-2h-2z" />
            </svg>
          )}
        </button>

        <p className="text-white/70 text-sm font-medium">
          {isRecording ? "Recording… tap to stop" : label}
        </p>
      </div>

      {/* Live transcript preview */}
      {transcript && (
        <div className="bg-white/5 rounded-xl p-3 text-sm text-white/80 leading-relaxed animate-fade-in">
          {transcript}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-red-400 text-xs text-center">{error}</p>
      )}
    </div>
  );
}
