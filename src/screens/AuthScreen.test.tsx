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
      verifyOtp: vi.fn(),
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

  it("renders guest login option, capabilities, email form, and footer links", () => {
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
    expect(screen.getByRole("button", { name: /send code/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /privacy/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /terms/i })).toBeTruthy();
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

  it("clicking CONTINUE AS GUEST when already a guest navigates back to home", async () => {
    useAppStore.setState({
      session: {
        access_token: "guest-token-123",
        user: { id: "guest-test-123", is_anonymous: true } as any,
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

    const guestBtn = screen.getByRole("button", { name: /continue as guest/i });
    fireEvent.click(guestBtn);

    await waitFor(() => {
      expect(screen.getByTestId("home-view")).toBeTruthy();
    });
  });

  it("Step 1: submitting email calls signInWithOtp with shouldCreateUser and advances to Step 2", async () => {
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

    const sendBtn = screen.getByRole("button", { name: /send code/i });
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(otpMock).toHaveBeenCalledWith({
        email: "tester@example.com",
        options: { shouldCreateUser: true },
      });
      expect(screen.getByText("ENTER CODE")).toBeTruthy();
      expect(screen.getByText("tester@example.com")).toBeTruthy();
      expect(screen.getByPlaceholderText("000000")).toBeTruthy();
    });
  });

  it("Step 2: entering 6-digit code calls verifyOtp; on success sets session and navigates home", async () => {
    vi.mocked(supabase.auth.signInWithOtp).mockResolvedValueOnce({
      data: {} as any,
      error: null,
    });

    const verifyMock = vi.mocked(supabase.auth.verifyOtp).mockResolvedValueOnce({
      data: {
        session: {
          access_token: "real-user-session-token",
          user: { id: "user-otp-456", email: "tester@example.com" },
        } as any,
        user: { id: "user-otp-456", email: "tester@example.com" } as any,
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

    // Step 1: Submit email
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "tester@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send code/i }));

    // Wait for Step 2
    await waitFor(() => {
      expect(screen.getByText("ENTER CODE")).toBeTruthy();
    });

    // Step 2: Input 6 digits
    const codeInput = screen.getByPlaceholderText("000000");
    fireEvent.change(codeInput, { target: { value: "123456" } });

    const verifyBtn = screen.getByRole("button", { name: /verify code/i });
    fireEvent.click(verifyBtn);

    await waitFor(() => {
      expect(verifyMock).toHaveBeenCalledWith({
        email: "tester@example.com",
        token: "123456",
        type: "email",
      });
      expect(screen.getByTestId("home-view")).toBeTruthy();
    });

    expect(useAppStore.getState().session?.user.id).toBe("user-otp-456");
  });

  it("Step 2: wrong OTP code displays error message without crashing", async () => {
    vi.mocked(supabase.auth.signInWithOtp).mockResolvedValueOnce({
      data: {} as any,
      error: null,
    });

    vi.mocked(supabase.auth.verifyOtp).mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: "Token has expired or is invalid", name: "AuthApiError", status: 400 } as any,
    });

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <Routes>
          <Route path="/auth" element={<AuthScreen />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "tester@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send code/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("000000")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("000000"), {
      target: { value: "999999" },
    });
    fireEvent.click(screen.getByRole("button", { name: /verify code/i }));

    await waitFor(() => {
      expect(screen.getByText(/Token has expired or is invalid/i)).toBeTruthy();
    });
  });

  it("Step 2: clicking 'Use different email' returns to email input", async () => {
    vi.mocked(supabase.auth.signInWithOtp).mockResolvedValueOnce({
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

    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "tester@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send code/i }));

    await waitFor(() => {
      expect(screen.getByText(/Use different email/i)).toBeTruthy();
    });

    fireEvent.click(screen.getByText(/Use different email/i));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("you@example.com")).toBeTruthy();
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
