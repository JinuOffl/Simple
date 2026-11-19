// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import App from "@/App";
import { HomeScreen } from "./HomeScreen";
import { BuilderScreen } from "./BuilderScreen";
import { PrivacyScreen } from "./PrivacyScreen";
import { TermsScreen } from "./TermsScreen";
import { useAppStore } from "@/lib/zustandStore";
import { supabase } from "@/lib/supabaseClient";
import { createLocalGuestSession } from "@/lib/guestAuth";

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

describe("Phase 2 — Auth and abuse protection", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    window.HTMLElement.prototype.scrollTo = vi.fn();
    useAppStore.setState({ session: null, user: null });
  });

  afterEach(() => {
    cleanup();
  });

  // ── 2.2: Guest CAPTCHA token passing ──────────────────────────────────────
  it("2.2: passes captchaToken to signInAnonymously when provided", async () => {
    const anonMock = vi.mocked(supabase.auth.signInAnonymously).mockResolvedValueOnce({
      data: {
        session: {
          access_token: "token-captcha",
          user: { id: "guest-captcha-user", is_anonymous: true },
        } as any,
        user: { id: "guest-captcha-user", is_anonymous: true } as any,
      },
      error: null,
    });

    const { signInAsGuest } = useAppStore.getState();
    const res = await signInAsGuest({ captchaToken: "cf-turnstile-token-xyz" });

    expect(res.ok).toBe(true);
    expect(anonMock).toHaveBeenCalledWith({
      options: { captchaToken: "cf-turnstile-token-xyz" },
    });
  });

  // ── 2.3: Local guest fallback notice on Home ──────────────────────────────
  it("2.3: shows offline notice on Home when using local guest session", async () => {
    const localSession = createLocalGuestSession();
    useAppStore.setState({ session: localSession, user: localSession.user });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
        </Routes>
      </MemoryRouter>
    );

    const notice = await screen.findByTestId("offline-guest-notice");
    expect(notice).toBeTruthy();
    expect(notice.textContent).toContain("Guest mode is offline. Sign in with email to build tools.");
  });

  // 2.3: Local guest fallback notice on Builder ─────────────────────────────
  it("2.3: shows offline notice on Builder and disables generation when using local guest", async () => {
    const localSession = createLocalGuestSession();
    useAppStore.setState({ session: localSession, user: localSession.user });

    render(
      <MemoryRouter initialEntries={["/build"]}>
        <Routes>
          <Route path="/build" element={<BuilderScreen />} />
        </Routes>
      </MemoryRouter>
    );

    const notice = await screen.findByTestId("offline-guest-notice");
    expect(notice).toBeTruthy();
    expect(notice.textContent).toContain("Guest mode is offline. Sign in with email to build tools.");

    const input = screen.getByPlaceholderText(/Sign in with email to build tools/i) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  // ── 2.4: Invite flow through pending sessionStorage ───────────────────────
  it("2.4: saves invite code in sessionStorage when unauthenticated, and restores after session appears", async () => {
    // 1. Simulate unauthenticated visit to hash route #/join/team-code-123
    window.location.hash = "#/join/team-code-123";

    render(<App />);

    // Unauthenticated user should have invite stored in sessionStorage and hash redirected to #/auth
    expect(sessionStorage.getItem("simple_pending_invite")).toBe("team-code-123");
    expect(window.location.hash).toBe("#/auth");

    // 2. Authenticate user
    useAppStore.getState().setSession({
      access_token: "mock-logged-in-token",
      user: { id: "user-123", email: "user@example.com" } as any,
    } as any);

    // After session appears, should navigate to #/join/team-code-123 and clear sessionStorage
    await waitFor(() => {
      expect(window.location.hash).toBe("#/join/team-code-123");
      expect(sessionStorage.getItem("simple_pending_invite")).toBeNull();
    });
  });

  // ── 2.5: Supabase auth hash tokens do not break HashRouter ────────────────
  it("2.5: replaces Supabase auth hash tokens (#access_token=...) with #/", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: {
        session: {
          access_token: "mock-token",
          user: { id: "user-hash-123", email: "user@example.com" } as any,
        } as any,
      },
      error: null,
    } as any);

    window.location.hash = "#access_token=fake-token&refresh_token=fake-refresh&type=recovery";

    render(<App />);

    await waitFor(() => {
      expect(supabase.auth.getSession).toHaveBeenCalled();
      expect(window.location.hash).toBe("#/");
    });
  });

  // ── 2.6: PrivacyScreen and TermsScreen content disclosures ────────────────
  it("2.6: PrivacyScreen and TermsScreen render plain language disclosures and [EDIT BEFORE LAUNCH]", () => {
    const { unmount: unmountPrivacy } = render(
      <MemoryRouter>
        <PrivacyScreen />
      </MemoryRouter>
    );

    expect(screen.getByText(/\[EDIT BEFORE LAUNCH\]/i)).toBeTruthy();
    expect(screen.getByText(/Guest data is stored on-device/i)).toBeTruthy();
    expect(screen.getByText(/Generations send your prompt to a third-party LLM provider/i)).toBeTruthy();
    unmountPrivacy();

    render(
      <MemoryRouter>
        <TermsScreen />
      </MemoryRouter>
    );

    expect(screen.getByText(/\[EDIT BEFORE LAUNCH\]/i)).toBeTruthy();
    expect(screen.getByText(/Guest data is stored on-device/i)).toBeTruthy();
    expect(screen.getByText(/Generations send your prompt to a third-party LLM provider/i)).toBeTruthy();
  });
});
