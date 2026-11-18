import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

interface InviteInfo {
  valid: boolean;
  app: {
    id: string;
    name: string;
    icon: string;
    description?: string;
  };
  role: "editor" | "viewer";
  expired?: boolean;
  exhausted?: boolean;
}

export function InviteJoinScreen() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!code) {
      setError("No invite code provided");
      setLoading(false);
      return;
    }

    const fetchInfo = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: invokeErr } = await supabase.functions.invoke("invites", {
          body: { op: "get_info", code },
        });

        if (invokeErr) {
          setError(invokeErr.message || "Unable to load invite");
        } else if (!data?.valid) {
          setError(
            data?.expired
              ? "This invite link has expired."
              : data?.exhausted
                ? "This invite link has reached its maximum uses."
                : "Invalid or inactive invite link."
          );
        } else {
          setInviteInfo(data as InviteInfo);
        }
      } catch (err) {
        setError((err as Error).message ?? "Failed to connect");
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, [code]);

  const handleAccept = async () => {
    if (!code || accepting) return;
    setAccepting(true);
    setError(null);

    try {
      const { data, error: acceptErr } = await supabase.functions.invoke("invites", {
        body: { op: "accept", code },
      });

      if (acceptErr) {
        setError(acceptErr.message || "Failed to accept invite");
        setAccepting(false);
        return;
      }

      if (data?.success && data?.app_id) {
        navigate(`/app/${data.app_id}`);
      } else {
        setError("Failed to join tool.");
        setAccepting(false);
      }
    } catch (err) {
      setError((err as Error).message ?? "Network error accepting invite");
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-mesh">
        <div className="flex flex-col items-center gap-4">
          <p
            className="font-doto text-n-text3 tracking-widest animate-pulse-slow"
            style={{ fontSize: "16px", fontVariationSettings: "'ROND' 0" }}
          >
            VERIFYING INVITE
          </p>
          <div className="flex gap-1">
            <span className="loading-dot" />
            <span className="loading-dot" />
            <span className="loading-dot" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-5 bg-gradient-mesh">
      <div className="w-full max-w-sm bg-n-surface border border-n-border rounded-card p-6 space-y-5 animate-fade-in text-center">
        {error ? (
          <div className="space-y-4">
            <span className="text-4xl">⚠️</span>
            <div className="space-y-1">
              <h2 className="font-mono text-sm font-semibold tracking-wide text-white uppercase">
                Invite Unavailable
              </h2>
              <p className="text-xs text-n-text2 leading-relaxed">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="btn-ghost w-full"
            >
              ← Go to Home
            </button>
          </div>
        ) : inviteInfo ? (
          <div className="space-y-4">
            <span className="text-5xl leading-none inline-block">{inviteInfo.app.icon}</span>

            <div className="space-y-1">
              <span className="nt-tag text-[9px] px-2 py-0.5 uppercase tracking-wider mb-2">
                Join as {inviteInfo.role}
              </span>
              <h2 className="font-mono text-base font-semibold tracking-wide text-white">
                {inviteInfo.app.name}
              </h2>
              {inviteInfo.app.description && (
                <p className="text-xs text-n-text2 leading-relaxed mt-1">
                  {inviteInfo.app.description}
                </p>
              )}
            </div>

            <p className="text-[11px] text-n-text3 font-mono leading-relaxed border-t border-n-border pt-3">
              You are invited to collaborate on this tool. You will be able to{" "}
              {inviteInfo.role === "editor"
                ? "use, edit, and contribute to shared collections."
                : "view live tool data in real time."}
            </p>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                disabled={accepting}
                onClick={handleAccept}
                className="btn-primary w-full"
              >
                {accepting ? "Joining…" : "Accept & Open Tool"}
              </button>
              <button
                type="button"
                disabled={accepting}
                onClick={() => navigate("/")}
                className="btn-ghost w-full text-xs"
              >
                Decline
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
