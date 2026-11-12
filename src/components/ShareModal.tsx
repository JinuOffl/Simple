import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

interface MemberItem {
  id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
  is_owner: boolean;
}

interface ShareModalProps {
  appId: string;
  appName: string;
  isOwner: boolean;
  onClose: () => void;
}

/**
 * Collaboration & invite management modal styled with Nothing-OS design tokens.
 */
export function ShareModal({ appId, appName, isOwner, onClose }: ShareModalProps) {
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [maxUses, setMaxUses] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const { data } = await supabase.functions.invoke("invites", {
        body: { op: "list_members", app_id: appId },
      });
      if (data?.members) {
        setMembers(data.members as MemberItem[]);
      }
    } catch {
      // Non-fatal if list members fails
    } finally {
      setLoadingMembers(false);
    }
  }, [appId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const handleGenerateInvite = async () => {
    setGenerating(true);
    setError(null);
    setCopied(false);

    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("invites", {
        body: {
          op: "create",
          app_id: appId,
          role,
          max_uses: maxUses,
        },
      });

      if (invokeErr || !data?.success) {
        setError(invokeErr?.message ?? "Failed to create invite");
      } else {
        const code = data.invite.code as string;
        const origin = window.location.origin;
        const pathname = window.location.pathname;
        const link = `${origin}${pathname}#/join/${code}`;
        setInviteLink(link);
      }
    } catch (err) {
      setError((err as Error).message ?? "Network error creating invite");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await supabase.functions.invoke("invites", {
        body: { op: "remove_member", app_id: appId, user_id: userId },
      });
      await loadMembers();
    } catch (err) {
      console.error("Failed to remove member:", err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div className="w-full max-w-md bg-n-surface border border-n-border rounded-card p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-n-border">
          <div>
            <h2
              id="share-modal-title"
              className="font-mono text-xs font-semibold tracking-wide text-white uppercase"
            >
              Collaborate · {appName}
            </h2>
            <p className="text-[10px] text-n-text3 mt-0.5">
              Invite friends or partners with real-time sync
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-n-text3 hover:text-white text-xs px-2 py-1"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-sm text-red-300 text-xs font-mono">
            {error}
          </div>
        )}

        {/* Create Invite Controls (Owner only) */}
        {isOwner && (
          <div className="space-y-3 bg-n-surface2/40 p-3.5 rounded-sm border border-n-border">
            <p className="text-[9px] font-mono uppercase tracking-[0.18em] text-n-text3">
              Generate Invite Link
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono text-n-text2 uppercase block mb-1">
                  Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
                  className="w-full bg-n-surface border border-n-border text-white text-xs p-2 rounded-sm outline-none"
                >
                  <option value="editor">Editor (Can edit)</option>
                  <option value="viewer">Viewer (Read-only)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono text-n-text2 uppercase block mb-1">
                  Max Uses
                </label>
                <select
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                  className="w-full bg-n-surface border border-n-border text-white text-xs p-2 rounded-sm outline-none"
                >
                  <option value={1}>1 use</option>
                  <option value={5}>5 uses</option>
                  <option value={10}>10 uses</option>
                  <option value={50}>50 uses</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              disabled={generating}
              onClick={handleGenerateInvite}
              className="btn-primary w-full text-xs"
            >
              {generating ? "Generating…" : "Create Invite Link"}
            </button>

            {inviteLink && (
              <div className="mt-2 p-2.5 bg-n-surface border border-n-border rounded-sm space-y-2 animate-fade-in">
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  className="w-full bg-transparent font-mono text-[11px] text-white/90 outline-none select-all"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="btn-ghost w-full text-[10px] uppercase tracking-wider"
                >
                  {copied ? "Copied to Clipboard ✓" : "Copy Link"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Member List */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-n-text3">
              Members ({members.length})
            </span>
          </div>

          {loadingMembers ? (
            <p className="text-xs text-n-text3 py-2 text-center font-mono">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-xs text-n-text3 py-2 text-center font-mono">
              Only you have access to this app.
            </p>
          ) : (
            <div className="divide-y divide-n-border border border-n-border rounded-sm overflow-hidden bg-n-surface">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <span className="font-mono text-[10px] text-white/80 truncate">
                      {m.user_id.slice(0, 8)}…
                    </span>
                    <span className="nt-tag text-[8px] px-1.5 py-0.5 leading-none lowercase">
                      {m.role}
                    </span>
                  </div>

                  {isOwner && !m.is_owner && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(m.user_id)}
                      className="text-n-text3 hover:text-red-400 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-2 flex justify-end">
          <button type="button" onClick={onClose} className="btn-ghost text-xs">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
