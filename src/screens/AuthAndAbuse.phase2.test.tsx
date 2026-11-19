// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import App from "@/App";
import { AuthScreen } from "./AuthScreen";
import { HomeScreen } from "./HomeScreen";
import { BuilderScreen } from "./BuilderScreen";
import { PrivacyScreen } from "./PrivacyScreen";
import { TermsScreen } from "./TermsScreen";
import { useAppStore } from "@/lib/zustandStore";
import { supabase } from "@/lib/supabaseClient";
import { createLocalGuestSession } from "@/lib/guestAuth";

vi.mock("@/lib/supabaseClient", () => ({
  hasValidSupabaseConfig: true,
  supabase: {
    auth: {
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      signInAnonymously: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn().mockImplementation(() => {
      const builder: any = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      builder.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve);
      return builder;
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

  // ── 2.1: Guest reaching /auth is NOT bounced and sees the guest banner ───
  it("2.1: guest reaching /auth is not redirected to '/' and sees the guest banner", async () => {
    const guestSession = createLocalGuestSession();
    useAppStore.setState({ session: guestSession, user: guestSession.user });

    render(
      <MemoryRouter initialEntries={["/auth"]}>
        <Routes>
          <Route path="/auth" element={<AuthScreen />} />
          <Route path="/" element={<div data-testid="home-view">Home Screen</div>} />
        </Routes>
      </MemoryRouter>
    );

    // Should NOT redirect to Home
    expect(screen.queryByTestId("home-view")).toBeNull();

    // Guest banner must be visible
    const banner = screen.getByTestId("guest-banner");
    expect(banner.textContent).toContain(
      "You are using guest mode. Signing in creates a new account; guest tools stay on this device."
    );
  });

  // ── 2.1: AuthScreen displays real error when signInAnonymously fails ───────
  it("2.1: shows real error text when signInAnonymously fails before falling back to local guest", async () => {
    vi.mocked(supabase.auth.signInAnonymously).mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: "Cloudflare Turnstile token expired" } as any,
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
      expect(screen.getByText("Cloudflare Turnstile token expired")).toBeTruthy();
    });

    // Local guest fallback session is set in state
    expect(useAppStore.getState().session?.user.id.startsWith("guest-")).toBe(true);
  });

  // ── 2.2: Anonymous Supabase UUID user reads app_data from Supabase ─────────
  it("2.2: anonymous UUID user reads app_data from Supabase (not local guest storage)", async () => {
    const anonUuidUser = {
      id: "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
      is_anonymous: true,
      email: null,
      app_metadata: { provider: "anonymous" },
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    };

    useAppStore.setState({
      session: {
        access_token: "mock-anon-jwt",
        user: anonUuidUser as any,
      } as any,
      user: anonUuidUser as any,
      apps: [
        {
          id: "app-uuid-1",
          user_id: anonUuidUser.id,
          name: "Live Counter",
          icon: "calculator",
          status: "active",
          manifest: {
            schema_version: 2,
            app_id: "app-uuid-1",
            name: "Live Counter",
            icon: "calculator",
            tool: { size: "2x1" },
            permissions: [],
            connectors: [],
            data: { collections: [] },
            screens: [{ id: "main", title: "Counter", nodes: [] }],
            actions: [],
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          pinned_order: null,
        },
      ],
    });

    // Mock supabase select from app_data returning stored count
    vi.mocked(supabase.from).mockImplementation((_table: string) => {
      const builder: any = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [{ app_id: "app-uuid-1", key: "counter", value: 42 }],
          error: null,
        }),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      builder.then = (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve);
      return builder;
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith("app_data");
    });
  });

  // ── 2.4: signOut cleans guest data for local guests after confirmation ────
  it("2.4: signOut removes simple_guest_, simple_checklist_, simple_heatmap_ for local guests only", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    // Populate localStorage
    localStorage.setItem("simple_guest_apps_guest-1", JSON.stringify([]));
    localStorage.setItem("simple_checklist_task_1", "wash dishes");
    localStorage.setItem("simple_heatmap_h1", "{}");
    localStorage.setItem("simple_other_setting", "preserve-this");

    const localGuest = createLocalGuestSession();
    useAppStore.setState({ session: localGuest, user: localGuest.user });

    await useAppStore.getState().signOut();

    expect(confirmSpy).toHaveBeenCalled();
    expect(localStorage.getItem("simple_guest_apps_guest-1")).toBeNull();
    expect(localStorage.getItem("simple_checklist_task_1")).toBeNull();
    expect(localStorage.getItem("simple_heatmap_h1")).toBeNull();
    expect(localStorage.getItem("simple_other_setting")).toBe("preserve-this");

    // Real user test: signOut does NOT remove those keys
    localStorage.setItem("simple_guest_apps_guest-1", "saved");
    localStorage.setItem("simple_checklist_task_1", "saved");
    useAppStore.setState({
      session: {
        access_token: "token",
        user: { id: "real-uuid-user", email: "user@test.com" } as any,
      } as any,
      user: { id: "real-uuid-user" } as any,
    });

    await useAppStore.getState().signOut();

    expect(localStorage.getItem("simple_guest_apps_guest-1")).toBe("saved");
    expect(localStorage.getItem("simple_checklist_task_1")).toBe("saved");
  });
});
