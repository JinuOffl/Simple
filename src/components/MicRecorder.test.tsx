// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { MicRecorder } from "./MicRecorder";

describe("MicRecorder", () => {
  let originalSpeechRecognition: unknown;

  beforeEach(() => {
    originalSpeechRecognition = window.SpeechRecognition;
  });

  afterEach(() => {
    cleanup();
    window.SpeechRecognition = originalSpeechRecognition as typeof window.SpeechRecognition;
  });

  it("calls onTranscript from onend with latest transcript from ref", () => {
    const onTranscript = vi.fn();

    let capturedOnResult: ((e: any) => void) | null = null;
    let capturedOnEnd: (() => void) | null = null;
    const mockStart = vi.fn();
    const mockStop = vi.fn();

    class FakeSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      start = mockStart;
      stop = mockStop;
      set onresult(fn: any) {
        capturedOnResult = fn;
      }
      set onend(fn: any) {
        capturedOnEnd = fn;
      }
      set onerror(_fn: any) {}
    }

    window.SpeechRecognition = FakeSpeechRecognition as any;

    render(
      <MicRecorder
        label="Voice Input"
        save_to="voice_note"
        onTranscript={onTranscript}
      />
    );

    const button = screen.getByRole("button", { name: "Start recording Voice Input" });
    fireEvent.click(button);

    expect(mockStart).toHaveBeenCalled();
    expect(capturedOnResult).toBeTruthy();
    expect(capturedOnEnd).toBeTruthy();

    // Deliver speech recognition results
    const fakeEvent = {
      results: [
        [{ transcript: "hello" }],
        [{ transcript: "world" }],
      ],
    };
    act(() => {
      capturedOnResult!(fakeEvent);
      capturedOnEnd!();
    });

    expect(onTranscript).toHaveBeenCalledTimes(1);
    expect(onTranscript).toHaveBeenCalledWith("hello world", "voice_note");
  });

  it("shows error when speech recognition is not supported", () => {
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;

    render(<MicRecorder label="Voice Input" />);
    const button = screen.getByRole("button", { name: "Start recording Voice Input" });
    fireEvent.click(button);

    expect(screen.getByText("Speech recognition not supported in this browser")).toBeTruthy();
  });
});
