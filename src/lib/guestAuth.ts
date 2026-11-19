import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export const GUEST_SESSION_KEY = "simple_guest_session";
export const GUEST_ID_KEY = "simple_guest_id";

export function isLocalGuestId(userId?: string | null): boolean {
  return Boolean(userId?.startsWith("guest-"));
}

export function isGuestUser(user: User | null | undefined): boolean {
  if (!user) return false;
  return Boolean(
    user.is_anonymous ||
    user.user_metadata?.is_guest ||
    user.id.startsWith("guest-")
  );
}

export function isLocalGuestSession(session: Session | null | undefined): boolean {
  if (!session) return false;
  return Boolean(
    session.access_token?.startsWith("guest-token-") ||
    session.user?.id?.startsWith("guest-")
  );
}

export function getLocalGuestSession(): Session | null {
  try {
    const raw = localStorage.getItem(GUEST_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (session?.user?.id) return session;
  } catch {
    localStorage.removeItem(GUEST_SESSION_KEY);
  }
  return null;
}

export function createLocalGuestSession(): Session {
  let guestId = localStorage.getItem(GUEST_ID_KEY);
  if (!guestId) {
    const randomSuffix =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10);
    guestId = `guest-${randomSuffix}`;
    try {
      localStorage.setItem(GUEST_ID_KEY, guestId);
    } catch {
      // localStorage may fail in private browsing quota exceeded
    }
  }

  const guestUser: User = {
    id: guestId,
    app_metadata: { provider: "anonymous" },
    user_metadata: { is_guest: true, name: "Guest User" },
    aud: "authenticated",
    created_at: new Date().toISOString(),
    is_anonymous: true,
  } as unknown as User;

  const guestSession: Session = {
    access_token: `guest-token-${guestId}`,
    refresh_token: `guest-refresh-${guestId}`,
    expires_in: 3600 * 24 * 365,
    expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    token_type: "bearer",
    user: guestUser,
  };

  try {
    localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(guestSession));
  } catch {
    // localStorage may fail in private browsing quota exceeded
  }

  return guestSession;
}

export function clearLocalGuestSession(): void {
  try {
    localStorage.removeItem(GUEST_SESSION_KEY);
  } catch {
    // ignore
  }
}

export async function loginAsGuest(
  options?: { captchaToken?: string }
): Promise<{ session: Session; isLocal: boolean; error?: string }> {
  let errorMsg: string | undefined;
  try {
    // 1. Attempt native Supabase anonymous sign-in first
    const credentials = options?.captchaToken
      ? { options: { captchaToken: options.captchaToken } }
      : undefined;
    const { data, error } = await supabase.auth.signInAnonymously(credentials);
    if (!error && data?.session) {
      clearLocalGuestSession();
      return { session: data.session, isLocal: false };
    }
    if (error) {
      errorMsg = error.message;
    }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : "Anonymous sign-in failed";
  }

  // 2. Seamless local guest session fallback
  const localSession = createLocalGuestSession();
  return { session: localSession, isLocal: true, error: errorMsg };
}

