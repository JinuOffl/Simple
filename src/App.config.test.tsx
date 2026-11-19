// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("./lib/supabaseClient", () => ({
  hasValidSupabaseConfig: false,
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

import App from "./App";

describe("App Configuration Error Screen", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders a clear 'Configuration Required' screen when Supabase env vars are missing", () => {
    render(<App />);

    expect(screen.getByText("Configuration Required")).toBeTruthy();
    expect(screen.getByText(/Missing Supabase configuration/i)).toBeTruthy();
    expect(screen.getByText("VITE_SUPABASE_URL")).toBeTruthy();
    expect(screen.getByText("VITE_SUPABASE_ANON_KEY")).toBeTruthy();
  });
});
