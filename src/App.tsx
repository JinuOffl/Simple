import { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAppStore } from "@/lib/zustandStore";
import { AuthScreen } from "@/screens/AuthScreen";
import { McpDemoScreen } from "@/screens/McpDemoScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { BuilderScreen } from "@/screens/BuilderScreen";
import { AppRunnerScreen } from "@/screens/AppRunnerScreen";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session } = useAppStore();
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

export default function App() {
  const setSession = useAppStore((s) => s.setSession);

  useEffect(() => {
    // Initialize session from Supabase (handles magic link callback)
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    // Listen for auth state changes (magic link clicks, sign-outs)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, [setSession]);

  return (
    <HashRouter>
      <Routes>
        {/* Public */}
        <Route path="/auth" element={<AuthScreen />} />

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
