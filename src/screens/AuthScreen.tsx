import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAppStore } from "@/lib/zustandStore";

const CAPABILITIES = [
  "calculator  →  arithmetic, offline",
  "clock       →  world time, timezone",
  "weather     →  real data, any city",
  "quiz        →  flashcards, mcq",
  "checklist   →  habits, todos",
  "ai tutor    →  voice conversation",
];

export function AuthScreen() {
  const navigate = useNavigate();
  const { session, signInAsGuest } = useAppStore();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      navigate("/", { replace: true });
    }
  }, [session, navigate]);

  const handleGuestLogin = async () => {
    setGuestLoading(true);
    setError(null);
    const res = await signInAsGuest();
    if (res.ok) {
      navigate("/", { replace: true });
    } else {
      setError(res.error ?? "Failed to sign in as guest");
      setGuestLoading(false);
    }
  };

  const handleSend = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) setError(error.message);
    else setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-mesh flex flex-col items-center justify-center p-6">

      {/* Wordmark */}
      <div className="mb-12 flex flex-col items-center gap-3 animate-slide-up">
        <h1
          className="font-doto text-white tracking-widest"
          style={{ fontSize: "clamp(52px, 18vw, 80px)", fontVariationSettings: "'ROND' 0", lineHeight: 1 }}
        >
          SIMPLE
        </h1>
        <p className="text-n-text3 text-xs uppercase tracking-[0.2em]">
          describe it. build it. use it.
        </p>
      </div>

      {/* Capabilities list — monospace grid */}
      <div className="w-full max-w-xs mb-10 animate-fade-in">
        <p className="text-n-text3 text-[9px] uppercase tracking-[0.18em] mb-3">
          what you can build
        </p>
        <div className="border border-n-border rounded-sm overflow-hidden">
          {CAPABILITIES.map((c, i) => (
            <div
              key={i}
              className="px-4 py-2.5 text-[11px] text-n-text2 font-mono border-b border-n-border last:border-b-0"
            >
              {c}
            </div>
          ))}
        </div>
      </div>

      {/* Auth */}
      <div className="w-full max-w-xs animate-slide-up">
        {!sent ? (
          <div className="space-y-4">
            {/* Primary Guest Login */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleGuestLogin}
                disabled={guestLoading || loading}
                className="w-full bg-white text-n-bg font-mono font-bold text-xs uppercase tracking-widest py-3.5 px-4 rounded-sm
                           hover:bg-n-text active:scale-[0.99] transition-all duration-150 flex items-center justify-center gap-2
                           shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {guestLoading ? (
                  <span className="flex items-center gap-1.5">
                    <span className="loading-dot !bg-n-bg" />
                    <span className="loading-dot !bg-n-bg" />
                    <span className="loading-dot !bg-n-bg" />
                  </span>
                ) : (
                  <>
                    <span>CONTINUE AS GUEST</span>
                    <span className="text-[11px]">→</span>
                  </>
                )}
              </button>
              <p className="text-center text-[10px] text-n-text3 font-mono tracking-wider">
                instant access · no email required
              </p>
            </div>

            {/* Divider */}
            <div className="relative py-1 flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-n-border" />
              </div>
              <span className="relative bg-n-bg px-2.5 text-[9px] uppercase tracking-[0.2em] text-n-text3 font-mono">
                or sign in with email
              </span>
            </div>

            {/* Email form */}
            <div className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full bg-n-surface border border-n-border rounded-sm px-4 py-3
                           text-white text-sm placeholder:text-n-text3 outline-none
                           focus:border-n-border2 transition-colors font-mono"
              />
              {error && (
                <p className="text-[11px] font-mono" style={{ color: "rgba(255,100,100,0.8)" }}>
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || guestLoading || !email.trim()}
                className="btn-ghost w-full py-3 text-xs uppercase tracking-widest cursor-pointer"
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <span className="loading-dot" />
                    <span className="loading-dot" />
                    <span className="loading-dot" />
                  </span>
                ) : (
                  "SEND MAGIC LINK"
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="glass-strong p-6 text-center space-y-4 animate-slide-up">
            <p className="font-doto text-white text-3xl tracking-widest"
               style={{ fontVariationSettings: "'ROND' 50" }}>
              SENT
            </p>
            <p className="text-n-text2 text-xs leading-relaxed">
              Magic link sent to<br />
              <span className="text-white">{email}</span>
            </p>
            <button onClick={() => setSent(false)} className="btn-ghost w-full text-[10px]">
              USE DIFFERENT EMAIL
            </button>
          </div>
        )}
        {import.meta.env.DEV && (
          <div className="mt-6 text-center">
            <a
              href="#/mcp-demo"
              className="text-n-text3 hover:text-white text-[10px] font-mono uppercase tracking-[0.18em] transition-colors"
            >
              open phase 1b mcp demo →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
