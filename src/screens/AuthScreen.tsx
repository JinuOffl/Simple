import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAppStore } from "@/lib/zustandStore";
import { isGuestUser, isLocalGuestId, clearLocalGuestSession, loginAsGuest } from "@/lib/guestAuth";

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
  const { session, setSession } = useAppStore();

  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  // Cloudflare Turnstile state
  const sitekey = import.meta.env.VITE_CAPTCHA_SITEKEY;
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const isGuest = Boolean(session && (isGuestUser(session.user) || isLocalGuestId(session.user?.id)));

  useEffect(() => {
    if (session && !isGuest) {
      navigate("/", { replace: true });
    }
  }, [session, isGuest, navigate]);

  const resetTurnstile = () => {
    try {
      const turnstile = (window as unknown as { turnstile?: { reset: (id?: string) => void } }).turnstile;
      if (turnstile) {
        if (widgetIdRef.current) {
          turnstile.reset(widgetIdRef.current);
        } else {
          turnstile.reset();
        }
      }
    } catch {
      // ignore
    }
    setCaptchaToken(null);
  };

  // Load Turnstile script if sitekey is configured
  useEffect(() => {
    if (!sitekey) return;
    if (document.getElementById("turnstile-script")) return;

    const script = document.createElement("script");
    script.id = "turnstile-script";
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [sitekey]);

  // Render Turnstile widget when script is ready
  useEffect(() => {
    if (!sitekey) return;
    let widgetId: string | undefined;

    const checkInterval = setInterval(() => {
      const turnstile = (window as unknown as { turnstile?: { render: (el: HTMLElement, opts: unknown) => string; remove: (id: string) => void } }).turnstile;
      if (turnstile && turnstileRef.current) {
        clearInterval(checkInterval);
        try {
          widgetId = turnstile.render(turnstileRef.current, {
            sitekey,
            theme: "dark",
            callback: (token: string) => setCaptchaToken(token),
            "expired-callback": () => setCaptchaToken(null),
            "error-callback": () => setCaptchaToken(null),
          });
          widgetIdRef.current = widgetId;
        } catch {
          // ignore duplicate render in strict mode
        }
      }
    }, 100);

    return () => {
      clearInterval(checkInterval);
      if (widgetId) {
        const turnstile = (window as unknown as { turnstile?: { remove: (id: string) => void } }).turnstile;
        try {
          turnstile?.remove(widgetId);
        } catch {
          // ignore
        }
      }
    };
  }, [sitekey]);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (step === "otp" && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown((c) => c - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [step, countdown]);

  const handleGuestLogin = async () => {
    if (isGuest && session) {
      navigate("/", { replace: true });
      return;
    }
    setGuestLoading(true);
    setError(null);
    try {
      const res = await loginAsGuest(captchaToken ? { captchaToken } : undefined);
      resetTurnstile();
      if (res.error) {
        setError(res.error);
        setSession(res.session);
        setGuestLoading(false);
        return;
      }
      setSession(res.session);
      navigate("/", { replace: true });
    } catch (err) {
      resetTurnstile();
      setError(err instanceof Error ? err.message : "Guest sign-in failed");
    } finally {
      setGuestLoading(false);
    }
  };

  const handleSendCode = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);

    const options: { shouldCreateUser: boolean; captchaToken?: string } = {
      shouldCreateUser: true,
      ...(sitekey && captchaToken ? { captchaToken } : {}),
    };

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options,
    });
    resetTurnstile();

    if (otpError) {
      const msg = otpError.message.toLowerCase().includes("failed to fetch")
        ? "Unable to connect to Supabase (Failed to fetch). If your Supabase project is paused, resume it in your Supabase dashboard or check VITE_SUPABASE_URL in .env."
        : otpError.message;
      setError(msg);
    } else {
      setStep("otp");
      setCountdown(30);
      setOtpCode("");
    }
    setLoading(false);
  };

  const handleVerifyCode = async () => {
    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      setError("Please enter the 6-digit verification code");
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otpCode.trim(),
      type: "email",
    });

    if (verifyError) {
      const msg = verifyError.message.toLowerCase().includes("failed to fetch")
        ? "Unable to connect to Supabase (Failed to fetch). Please check your internet connection or Supabase status."
        : (verifyError.message || "Invalid or expired verification code");
      setError(msg);
      setLoading(false);
    } else if (data?.session) {
      clearLocalGuestSession();
      setSession(data.session);
      navigate("/", { replace: true });
    } else {
      setError("Verification failed. Please try again.");
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (countdown > 0 || loading) return;
    setLoading(true);
    setError(null);

    const options: { shouldCreateUser: boolean; captchaToken?: string } = {
      shouldCreateUser: true,
      ...(sitekey && captchaToken ? { captchaToken } : {}),
    };

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options,
    });
    resetTurnstile();

    if (otpError) {
      const msg = otpError.message.toLowerCase().includes("failed to fetch")
        ? "Unable to connect to Supabase (Failed to fetch). If your Supabase project is paused, resume it in your Supabase dashboard or check VITE_SUPABASE_URL in .env."
        : otpError.message;
      setError(msg);
    } else {
      setCountdown(30);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-[100dvh] bg-n-bg flex flex-col items-center justify-center px-6 pb-16">
      <div className="w-full max-w-[360px] space-y-0">
        {/* Wordmark (A1) */}
        <div className="mb-8 flex flex-col items-center text-center animate-slide-up">
          <h1
            className="font-doto text-white tracking-widest"
            style={{ fontSize: "clamp(48px, 16vw, 72px)", fontVariationSettings: "'ROND' 0", lineHeight: 1 }}
          >
            SIMPLE
          </h1>
          <p className="font-grotesk text-xs text-n-disabled tracking-widest mt-2">
            Personal AI tool builder
          </p>
        </div>

        {/* Guest Banner (A2) */}
        {isGuest && (
          <div
            data-testid="guest-banner"
            className="border-l-2 border-n-line3 pl-3 py-1 my-4 animate-slide-up"
          >
            <p className="font-grotesk text-xs text-n-secondary leading-relaxed">
              You are using guest mode. Signing in creates a new account; guest tools stay on this device.
            </p>
          </div>
        )}

        {/* Capabilities list — unstyled minimal list (A3) */}
        <div className="my-6 animate-fade-in">
          <p className="nt-label mb-3">what you can build</p>
          <div className="space-y-2.5">
            {CAPABILITIES.map((c, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-1 h-1 rounded-full bg-n-line3 shrink-0" />
                <span className="font-grotesk text-xs text-n-secondary">{c}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Auth (A4-A7) */}
        <div className="w-full animate-slide-up">
          {step === "email" ? (
            <div className="space-y-4">
              {/* Primary Guest Login (A7) */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleGuestLogin}
                  disabled={guestLoading || loading}
                  className="w-full bg-white text-black font-grotesk font-medium text-sm py-3.5 px-4 tracking-wide
                             hover:bg-n-primary active:scale-[0.99] transition-all duration-150 flex items-center justify-center gap-2
                             cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed nt-press"
                >
                  {guestLoading ? (
                    <span className="flex items-center gap-1.5">
                      <span className="loading-dot !bg-black" />
                      <span className="loading-dot !bg-black" />
                      <span className="loading-dot !bg-black" />
                    </span>
                  ) : (
                    <span>CONTINUE AS GUEST</span>
                  )}
                </button>

                {/* Turnstile widget container when sitekey is configured */}
                {Boolean(sitekey) && (
                  <div
                    ref={turnstileRef}
                    className="flex justify-center my-2 min-h-[65px]"
                    data-testid="turnstile-container"
                  />
                )}

                <p className="text-center text-[10px] text-n-disabled font-mono tracking-wider mt-2">
                  instant access · no email required
                </p>
              </div>

              {/* Divider (A4) */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-n-line" />
                <span className="nt-label">or sign in with email</span>
                <div className="flex-1 h-px bg-n-line" />
              </div>

              {/* Email form (A5, A6) */}
              <div className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendCode()}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full bg-transparent border-b border-n-line2 px-0 py-2.5 text-sm text-n-primary font-grotesk outline-none
                             focus:border-n-line3 transition-colors placeholder:text-n-disabled"
                />
                {error && (
                  <p className="text-[11px] font-mono text-n-red" role="alert">
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={loading || guestLoading || !email.trim()}
                  className="mt-3 ml-auto block font-mono text-[10px] uppercase tracking-widest text-n-secondary border border-n-line px-5 py-2
                             hover:border-n-line3 hover:text-n-display transition-colors nt-press cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center gap-1.5">
                      <span className="loading-dot" />
                      <span className="loading-dot" />
                      <span className="loading-dot" />
                    </span>
                  ) : (
                    "SEND CODE →"
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* Step 2: 6-digit numeric OTP code input */
            <div className="bg-n-s1 border border-n-line2 p-6 space-y-4 animate-slide-up">
              <div className="text-center space-y-1">
                <p
                  className="font-doto text-white text-2xl tracking-widest"
                  style={{ fontVariationSettings: "'ROND' 50" }}
                >
                  ENTER CODE
                </p>
                <p className="text-n-secondary text-xs leading-relaxed font-grotesk">
                  6-digit code sent to<br />
                  <span className="text-white font-medium">{email}</span>
                </p>
              </div>

              <div className="space-y-3">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && otpCode.length === 6 && handleVerifyCode()}
                  placeholder="000000"
                  autoFocus
                  className="w-full bg-transparent border-b border-n-line2 px-4 py-3
                             text-white text-center text-lg tracking-[0.5em] placeholder:text-n-disabled
                             outline-none focus:border-n-line3 transition-colors font-mono"
                />

                {error && (
                  <p className="text-[11px] font-mono text-n-red text-center" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleVerifyCode}
                  disabled={loading || otpCode.length !== 6}
                  className="w-full bg-white text-black font-grotesk font-medium text-sm py-3 px-4
                             hover:bg-n-primary transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed nt-press"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-1.5">
                      <span className="loading-dot !bg-black" />
                      <span className="loading-dot !bg-black" />
                      <span className="loading-dot !bg-black" />
                    </span>
                  ) : (
                    "VERIFY CODE"
                  )}
                </button>

                <div className="flex items-center justify-between pt-2 text-[10px] font-mono">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("email");
                      setError(null);
                      setOtpCode("");
                    }}
                    className="text-n-disabled hover:text-white transition-colors uppercase tracking-wider cursor-pointer"
                  >
                    Use different email
                  </button>

                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={countdown > 0 || loading}
                    className="text-n-disabled hover:text-white disabled:opacity-40 transition-colors uppercase tracking-wider cursor-pointer disabled:cursor-default"
                  >
                    {countdown > 0 ? `Resend code in ${countdown}s` : "Resend code"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer links to Privacy & Terms */}
          <div className="mt-8 flex items-center justify-center gap-3 text-[10px] font-mono uppercase tracking-widest text-n-disabled">
            <Link to="/privacy" className="hover:text-white transition-colors">
              Privacy
            </Link>
            <span>·</span>
            <Link to="/terms" className="hover:text-white transition-colors">
              Terms
            </Link>
          </div>

          {import.meta.env.DEV && (
            <div className="mt-4 text-center">
              <a
                href="#/mcp-demo"
                className="text-n-disabled hover:text-white text-[10px] font-mono uppercase tracking-[0.18em] transition-colors"
              >
                open phase 1b mcp demo →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
