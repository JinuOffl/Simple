// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isGuestUser,
  createLocalGuestSession,
  getLocalGuestSession,
  clearLocalGuestSession,
  loginAsGuest,
  GUEST_SESSION_KEY,
  GUEST_ID_KEY,
} from "./guestAuth";
import { supabase } from "./supabaseClient";
import type { User } from "@supabase/supabase-js";

describe("guestAuth", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("isGuestUser", () => {
    it("returns false for null/undefined user", () => {
      expect(isGuestUser(null)).toBe(false);
      expect(isGuestUser(undefined)).toBe(false);
    });

    it("returns true for user with is_anonymous: true", () => {
      const user = { id: "user-123", is_anonymous: true } as unknown as User;
      expect(isGuestUser(user)).toBe(true);
    });

    it("returns true for user with is_guest metadata", () => {
      const user = {
        id: "user-456",
        user_metadata: { is_guest: true },
      } as unknown as User;
      expect(isGuestUser(user)).toBe(true);
    });

    it("returns true for user with guest- prefix ID", () => {
      const user = { id: "guest-abc-789" } as unknown as User;
      expect(isGuestUser(user)).toBe(true);
    });

    it("returns false for regular authenticated user", () => {
      const user = {
        id: "real-uuid-123",
        email: "alice@example.com",
        is_anonymous: false,
        user_metadata: {},
      } as unknown as User;
      expect(isGuestUser(user)).toBe(false);
    });
  });

  describe("local session management", () => {
    it("creates, retrieves, and clears local guest session", () => {
      expect(getLocalGuestSession()).toBeNull();

      const session = createLocalGuestSession();
      expect(session).toBeDefined();
      expect(session.user.id).toMatch(/^guest-/);
      expect(session.user.is_anonymous).toBe(true);
      expect(session.access_token).toContain("guest-token-");

      const retrieved = getLocalGuestSession();
      expect(retrieved).not.toBeNull();
      expect(retrieved?.user.id).toBe(session.user.id);

      clearLocalGuestSession();
      expect(getLocalGuestSession()).toBeNull();
    });

    it("reuses existing guest ID if present in localStorage", () => {
      localStorage.setItem(GUEST_ID_KEY, "guest-persistent-123");
      const session = createLocalGuestSession();
      expect(session.user.id).toBe("guest-persistent-123");
    });
  });

  describe("loginAsGuest", () => {
    it("uses native Supabase session if signInAnonymously succeeds", async () => {
      const mockSupabaseSession = {
        access_token: "sb-jwt-token",
        refresh_token: "sb-refresh",
        user: { id: "supabase-anon-uuid", is_anonymous: true },
      };

      vi.spyOn(supabase.auth, "signInAnonymously").mockResolvedValueOnce({
        data: { session: mockSupabaseSession as any, user: mockSupabaseSession.user as any },
        error: null,
      });

      const result = await loginAsGuest();
      expect(result.isLocal).toBe(false);
      expect(result.session.access_token).toBe("sb-jwt-token");
    });

    it("falls back cleanly to local guest session if signInAnonymously returns error", async () => {
      vi.spyOn(supabase.auth, "signInAnonymously").mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: "Anonymous sign-ins are disabled", name: "AuthApiError", status: 400 } as any,
      });

      const result = await loginAsGuest();
      expect(result.isLocal).toBe(true);
      expect(result.session.user.id).toMatch(/^guest-/);
      expect(localStorage.getItem(GUEST_SESSION_KEY)).not.toBeNull();
    });

    it("falls back cleanly to local guest session if signInAnonymously throws", async () => {
      vi.spyOn(supabase.auth, "signInAnonymously").mockRejectedValueOnce(
        new Error("Network offline")
      );

      const result = await loginAsGuest();
      expect(result.isLocal).toBe(true);
      expect(result.session.user.id).toMatch(/^guest-/);
    });
  });
});
