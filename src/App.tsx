import { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAppStore } from "@/lib/zustandStore";
import { clearLocalGuestSession, getLocalGuestSession } from "@/lib/guestAuth";
import { AuthScreen } from "@/screens/AuthScreen";
import { PrivacyScreen } from "@/screens/PrivacyScreen";
import { TermsScreen } from "@/screens/TermsScreen";
import { McpDemoScreen } from "@/screens/McpDemoScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { BuilderScreen } from "@/screens/BuilderScreen";
import { AppRunnerScreen } from "@/screens/AppRunnerScreen";
import { PlanUsageScreen } from "@/screens/PlanUsageScreen";
import { ConnectionsScreen } from "@/screens/ConnectionsScreen";
import { InviteJoinScreen } from "@/screens/InviteJoinScreen";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session } = useAppStore();
  const location = useLocation();

  if (!session) {
    const inviteMatch = location.pathname.match(/^\/(?:join|invite)\/([a-zA-Z0-9_-]+)/);
    if (inviteMatch) {
      try {
        sessionStorage.setItem("simple_pending_invite", inviteMatch[1]);
      } catch {
        // ignore
      }
    }
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { session, setSession } = useAppStore();

  useEffect(() => {
    // 2.5 Guard: Supabase auth hash tokens (#access_token=... or error_description=...)
    const currentHash = typeof window !== "undefined" ? window.location.hash : "";
    if (
      currentHash.startsWith("#access_token") ||
      currentHash.includes("error_description")
    ) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          clearLocalGuestSession();
          setSession(data.session);
        }
        window.location.hash = "#/";
      });
      return;
    }

    // 2.4 Invite flow: when hash route is /join/:code or /invite/:code without session
    const inviteMatch = currentHash.match(/^#(?:#|\/)(?:join|invite)\/([a-zA-Z0-9_-]+)/);
    if (inviteMatch && !useAppStore.getState().session) {
      try {
        sessionStorage.setItem("simple_pending_invite", inviteMatch[1]);
      } catch {
        // ignore
      }
      window.location.hash = "#/auth";
    }

    // Initialize session from Supabase (handles magic link callback or anonymous session)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSession(data.session);
      } else {
        const localGuest = getLocalGuestSession();
        setSession(localGuest);
      }
    });

    // Listen for auth state changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession) {
        clearLocalGuestSession();
        setSession(newSession);
      } else {
        const localGuest = getLocalGuestSession();
        setSession(localGuest);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [setSession]);

  // Navigate to pending invite when session appears
  useEffect(() => {
    if (session) {
      try {
        const pendingCode = sessionStorage.getItem("simple_pending_invite");
        if (pendingCode) {
          sessionStorage.removeItem("simple_pending_invite");
          window.location.hash = `#/join/${pendingCode}`;
        }
      } catch {
        // ignore
      }
    }
  }, [session]);

  return (
    <HashRouter>
      <Routes>
        {/* Public */}
        <Route path="/auth" element={<AuthScreen />} />
        <Route path="/privacy" element={<PrivacyScreen />} />
        <Route path="/terms" element={<TermsScreen />} />

        {/* Protected */}
        <Route
          path="/"
          element={
            <AuthGuard>
              <HomeScreen />
            </AuthGuard>
          }
        />
        <Route
          path="/build"
          element={
            <AuthGuard>
              <BuilderScreen />
            </AuthGuard>
          }
        />
        <Route
          path="/app/:id"
          element={
            <AuthGuard>
              <AppRunnerScreen />
            </AuthGuard>
          }
        />
        <Route
          path="/plan"
          element={
            <AuthGuard>
              <PlanUsageScreen />
            </AuthGuard>
          }
        />
        <Route
          path="/connections"
          element={
            <AuthGuard>
              <ConnectionsScreen />
            </AuthGuard>
          }
        />
        <Route
          path="/join/:code"
          element={
            <AuthGuard>
              <InviteJoinScreen />
            </AuthGuard>
          }
        />
        <Route
          path="/invite/:code"
          element={
            <AuthGuard>
              <InviteJoinScreen />
            </AuthGuard>
          }
        />
        <Route
          path="/mcp-demo"
          element={
            import.meta.env.DEV ? (
              <McpDemoScreen />
            ) : (
              <AuthGuard>
                <McpDemoScreen />
              </AuthGuard>
            )
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
