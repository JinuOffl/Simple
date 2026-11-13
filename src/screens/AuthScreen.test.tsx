// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthScreen } from "./AuthScreen";
import { useAppStore } from "@/lib/zustandStore";
import { supabase } from "@/lib/supabaseClient";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      signInWithOtp: vi.fn(),
      signInAnonymously: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));

describe("AuthScreen", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useAppStore.setState({ session: null, user: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders guest login option, capabilities, and email form", () => {
    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <Routes>
          <Route path="/auth" element={<AuthScreen />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("SIMPLE")).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue as guest/i })).toBeTruthy();
    expect(screen.getByText(/instant access · no email required/i)).toBeTruthy();
    expect(screen.getByPlaceholderText("you@example.com")).toBeTruthy();
    expect(screen.getByRole("button", { name: /send magic link/i })).toBeTruthy();
  });

  it("clicking CONTINUE AS GUEST triggers guest sign-in and navigates to home", async () => {
    vi.spyOn(supabase.auth, "signInAnonymously").mockResolvedValueOnce({
      data: {
        session: {
          access_token: "mock-token",
          user: { id: "guest-test-123", is_anonymous: true },
        } as any,
        user: { id: "guest-test-123", is_anonymous: true } as any,
      },
      error: null,
    });

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <Routes>
          <Route path="/auth" element={<AuthScreen />} />
          <Route path="/" element={<div data-testid="home-view">Home Screen</div>} />
        </Routes>
      </MemoryRouter>
    );

    const guestBtn = screen.getByRole("button", { name: /continue as guest/i });
    fireEvent.click(guestBtn);

    await waitFor(() => {
      expect(screen.getByTestId("home-view")).toBeTruthy();
    });

    expect(useAppStore.getState().session?.user.id).toBe("guest-test-123");
  });

  it("signing in with email calls signInWithOtp and displays SENT screen", async () => {
    const otpMock = vi.mocked(supabase.auth.signInWithOtp).mockResolvedValueOnce({
      data: {} as any,
      error: null,
    });

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <Routes>
          <Route path="/auth" element={<AuthScreen />} />
        </Routes>
      </MemoryRouter>
    );

    const emailInput = screen.getByPlaceholderText("you@example.com");
    fireEvent.change(emailInput, { target: { value: "tester@example.com" } });

    const sendBtn = screen.getByRole("button", { name: /send magic link/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(otpMock).toHaveBeenCalledWith(
        expect.objectContaining({ email: "tester@example.com" })
      );
      expect(screen.getByText("SENT")).toBeTruthy();
      expect(screen.getByText("tester@example.com")).toBeTruthy();
    });
  });

  it("redirects automatically to home if a session is already present", async () => {
    useAppStore.setState({
      session: {
        access_token: "token",
        user: { id: "user-1", email: "test@example.com" } as any,
      } as any,
    });

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <Routes>
          <Route path="/auth" element={<AuthScreen />} />
          <Route path="/" element={<div data-testid="home-view">Home Screen</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId("home-view")).toBeTruthy();
    });
  });
});
