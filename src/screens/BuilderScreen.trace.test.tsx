// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BuilderScreen } from "./BuilderScreen";
import { logGeneration, clearGenerationLog } from "@/lib/generationLog";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

describe("BuilderScreen DEV LLM Trace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGenerationLog();
    window.HTMLElement.prototype.scrollTo = vi.fn();
  });

  afterEach(() => {
    cleanup();
    clearGenerationLog();
  });

  it("renders collapsible LLM TRACE summary with recorded generation log entries in DEV", () => {
    logGeneration({
      tier: "edge",
      userPrompt: "Habit tracker",
      existingManifestBytes: 256,
      ok: true,
      repairAttempts: 0,
      latencyMs: 340,
    });

    render(
      <MemoryRouter>
        <BuilderScreen />
      </MemoryRouter>
    );

    const traceSummary = screen.getByText(/LLM TRACE \(1\)/i);
    expect(traceSummary).toBeTruthy();
    expect(screen.getByText(/"Habit tracker"/i)).toBeTruthy();
    expect(screen.getByText(/\[edge\] ✓ OK/i)).toBeTruthy();
  });
});
