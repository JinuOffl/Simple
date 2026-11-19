import { useState, useRef, useEffect } from "react";
import { Mic, Square } from "lucide-react";

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
    <div className="bg-n-s1 border border-n-line rounded-sm p-4 space-y-3 animate-fade-in">
      {/* Mic button */}
      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          aria-label={isRecording ? "Stop recording" : `Start recording ${label}`}
          className={`
            w-12 h-12 rounded-full flex items-center justify-center border-2
            transition-all duration-150 nt-press cursor-pointer
            ${isRecording
              ? "border-n-red bg-n-red-dim text-n-red animate-pulse"
              : "bg-transparent border-n-line2 hover:border-n-line3 text-n-secondary hover:text-n-display"
            }
          `}
        >
          {isRecording ? (
            <Square size={14} className="fill-current" />
          ) : (
            <Mic size={16} strokeWidth={1.5} />
          )}
        </button>

        <p className="nt-label text-center">
          {isRecording ? "Recording… tap to stop" : label}
        </p>
      </div>

      {/* Live transcript preview */}
      {transcript && (
        <div className="bg-n-s2 border border-n-line rounded-sm p-3 font-grotesk text-xs text-n-primary leading-relaxed animate-fade-in">
          {transcript}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-n-red text-xs font-grotesk text-center">{error}</p>
      )}
    </div>
  );
}
