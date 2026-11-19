import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CREDIT_COSTS_BY_CLASS, PLANS, type CreditCostClass } from "@/config/plans";
import { createDefaultEntitlement, getPlanConfig, getRemainingCredits } from "@/lib/credits";
import { downloadAppExport, useAppStore } from "@/lib/zustandStore";
import {
  getByokStatus,
  saveByokKey,
  deleteByokKey,
  type ByokStatus,
} from "@/lib/entitlementProvider";

const COST_LABELS: Record<CreditCostClass, string> = {
  generation: "Generate / Edit Tool",
  runtime_llm: "Runtime LLM Action",
  mcp_call: "MCP Connector Tool Call",
  api_fetch: "Allowlisted Public API",
};

export function PlanUsageScreen() {
  const navigate = useNavigate();
  const {
    apps,
    entitlement,
    usageLedger,
    loadingEntitlement,
    entitlementSyncStatus,
    lastLimitError,
    clearLimitError,
    fetchApps,
    fetchEntitlementAndUsage,
    sleepApp,
    wakeApp,
    exportApp,
  } = useAppStore();

  useEffect(() => {
    void fetchApps();
    void fetchEntitlementAndUsage();
  }, [fetchApps, fetchEntitlementAndUsage]);

  const [byokStatus, setByokStatus] = useState<ByokStatus | null>(null);
  const [byokInput, setByokInput] = useState("");
  const [savingByok, setSavingByok] = useState(false);
  const [byokError, setByokError] = useState<string | null>(null);

  useEffect(() => {
    void getByokStatus().then(setByokStatus);
  }, []);

  const handleSaveByok = async () => {
    const key = byokInput.trim();
    if (!key) return;
    setSavingByok(true);
    setByokError(null);
    const res = await saveByokKey(key, "groq");
    if (res.success) {
      setByokStatus({ has_byok: true, preview: res.preview, provider: "groq" });
      setByokInput("");
    } else {
      setByokError(res.error ?? "Failed to save key");
    }
    setSavingByok(false);
  };

  const handleDeleteByok = async () => {
    setSavingByok(true);
    setByokError(null);
    const res = await deleteByokKey();
    if (res.success) {
      setByokStatus({ has_byok: false });
    } else {
      setByokError(res.error ?? "Failed to remove key");
    }
    setSavingByok(false);
  };

  const currentEntitlement = entitlement ?? createDefaultEntitlement();
  const planConfig = getPlanConfig(currentEntitlement.plan);
  const activeApps = apps.filter((a) => (a.status ?? "active") === "active");
  const sleepingApps = apps.filter((a) => a.status === "sleeping");
  const remainingCredits = getRemainingCredits(currentEntitlement);
  const activeRatio = Math.min(
    100,
    Math.round((activeApps.length / Math.max(1, currentEntitlement.active_app_limit)) * 100)
  );
  const creditRatio = Math.min(
    100,
    Math.round(
      (currentEntitlement.credits_used / Math.max(1, currentEntitlement.monthly_credit_limit)) * 100
    )
  );

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-mesh">
      <header className="px-4 py-4 flex items-center justify-between border-b border-n-border">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-n-text3 hover:text-white transition-colors text-xs uppercase tracking-wider"
        >
          ← back
        </button>

        <span className="nt-tag">{planConfig.label.toLowerCase()} plan</span>
      </header>

      <main className="flex-1 max-w-lg w-full mx-auto px-4 py-5 space-y-5">
        {entitlementSyncStatus === "fallback" && (
          <div className="bg-n-surface border border-n-border2 rounded-sm px-4 py-3 text-[11px] font-mono text-n-text2">
            Using local Free plan defaults until migration{" "}
            <code className="text-white">002_v2_schema.sql</code> is applied to Supabase.
          </div>
        )}

        {lastLimitError && (
          <div className="bg-n-surface border border-white/30 rounded-sm px-4 py-3 flex items-start justify-between gap-3">
            <p className="text-xs text-white leading-relaxed">{lastLimitError}</p>
            <button
              type="button"
              onClick={clearLimitError}
              className="text-n-text3 hover:text-white text-xs shrink-0"
              aria-label="Dismiss limit notice"
            >
              ✕
            </button>
          </div>
        )}

        {/* Current Plan & Usage Summary */}
        <section className="glass p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-n-text3 text-[9px] uppercase tracking-[0.18em]">
                current plan
              </p>
              <h1 className="text-white text-lg font-semibold uppercase tracking-wider mt-1">
                {planConfig.label}
              </h1>
            </div>
            {loadingEntitlement && <span className="nt-tag">syncing</span>}
          </div>

          <p className="text-n-text2 text-xs leading-relaxed">{planConfig.description}</p>

          {/* Active tools meter */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-n-text2">ACTIVE TOOLS</span>
              <span className="text-white">
                {activeApps.length} / {currentEntitlement.active_app_limit}
              </span>
            </div>
            <div className="h-1.5 bg-n-surface2 rounded-full overflow-hidden border border-n-border">
              <div
                className="h-full bg-white transition-all duration-200"
                style={{ width: `${activeRatio}%` }}
              />
            </div>
            {sleepingApps.length > 0 && (
              <p className="text-n-text3 text-[10px] font-mono">
                {sleepingApps.length} sleeping tool{sleepingApps.length !== 1 ? "s" : ""} (never deleted — exportable anytime)
              </p>
            )}
          </div>

          {/* Monthly credits meter */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-n-text2">MONTHLY CREDITS</span>
              <span className="text-white">
                {remainingCredits} left ({currentEntitlement.credits_used} / {currentEntitlement.monthly_credit_limit} used)
              </span>
            </div>
            <div className="h-1.5 bg-n-surface2 rounded-full overflow-hidden border border-n-border">
              <div
                className="h-full bg-white transition-all duration-200"
                style={{ width: `${creditRatio}%` }}
              />
            </div>
          </div>
        </section>

        {/* Manage Active & Sleeping Tools */}
        <section className="glass p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-n-text3 text-[9px] uppercase tracking-[0.18em]">
              tools ({activeApps.length} active · {sleepingApps.length} sleeping)
            </p>
          </div>

          {apps.length === 0 ? (
            <p className="text-n-text3 text-xs">No saved tools yet.</p>
          ) : (
            <div className="border border-n-border rounded-sm divide-y divide-n-border">
              {apps.map((app) => {
                const isSleeping = app.status === "sleeping";
                return (
                  <div
                    key={app.id}
                    className="px-3.5 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-lg shrink-0">{app.icon}</span>
                      <div className="min-w-0">
                        <p className="text-xs text-white truncate">{app.name}</p>
                        <p className="text-[10px] font-mono uppercase text-n-text3">
                          {isSleeping ? "sleeping" : "active"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => downloadAppExport(app, exportApp)}
                        className="px-2 py-1 text-[10px] font-mono uppercase text-n-text2 hover:text-white border border-n-border rounded-sm transition-colors"
                      >
                        Export
                      </button>
                      {isSleeping ? (
                        <button
                          type="button"
                          onClick={() => {
                            void wakeApp(app.id);
                          }}
                          className="px-2.5 py-1 text-[10px] font-mono uppercase text-white border border-n-border2 hover:bg-white hover:text-n-bg rounded-sm transition-colors"
                        >
                          Wake
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            void sleepApp(app.id);
                          }}
                          className="px-2.5 py-1 text-[10px] font-mono uppercase text-n-text2 hover:text-white border border-n-border rounded-sm transition-colors"
                        >
                          Sleep
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Credit Weights (config-driven) */}
        <section className="glass p-5 space-y-3">
          <p className="text-n-text3 text-[9px] uppercase tracking-[0.18em]">
            credit schedule
          </p>
          <div className="border border-n-border rounded-sm divide-y divide-n-border">
            {(Object.keys(CREDIT_COSTS_BY_CLASS) as CreditCostClass[]).map((costClass) => (
              <div
                key={costClass}
                className="px-3.5 py-2.5 flex items-center justify-between text-xs"
              >
                <span className="text-n-text2">{COST_LABELS[costClass]}</span>
                <span className="font-mono text-white">
                  {CREDIT_COSTS_BY_CLASS[costClass]} cr
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Available Tiers (read-only; server-enforced entitlements) */}
        <section className="glass p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-n-text3 text-[9px] uppercase tracking-[0.18em]">
              plan tiers
            </p>
            <span className="text-[10px] text-n-text3 font-mono">server-verified</span>
          </div>
          <div className="grid grid-cols-1 gap-2">
            {Object.values(PLANS).map((tier) => {
              const isCurrent = tier.id === currentEntitlement.plan;
              return (
                <div
                  key={tier.id}
                  className={`p-3 rounded-sm border ${
                    isCurrent ? "border-white/50 bg-n-surface2" : "border-n-border bg-n-surface"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-white">
                      {tier.label}
                    </span>
                    <span className="text-[10px] font-mono text-n-text2">
                      {tier.activeAppLimit} active · {tier.monthlyCreditLimit} cr/mo
                    </span>
                  </div>
                  <p className="text-[11px] text-n-text3 mt-1">{tier.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bring Your Own Key (BYOK) */}
        <section className="glass p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-n-text3 text-[9px] uppercase tracking-[0.18em]">
              bring your own key (byok)
            </p>
            <span className="nt-tag text-[9px] uppercase tracking-wider">
              {byokStatus?.has_byok ? "active" : "optional"}
            </span>
          </div>

          <p className="text-n-text2 text-xs leading-relaxed">
            Provide your own Groq API key to bypass monthly credit limits for tool generation
            and runtime LLM actions. Keys are AES-GCM-256 encrypted server-side and never
            exposed in client bundles.
          </p>

          {byokError && (
            <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/40 rounded-sm p-2 font-mono">
              {byokError}
            </p>
          )}

          {byokStatus?.has_byok ? (
            <div className="bg-n-surface border border-n-border rounded-sm p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-xs font-mono text-white">
                    {byokStatus.preview ?? "Active Key"}
                  </span>
                  <p className="text-[10px] text-n-text3 font-mono">
                    Provider: {byokStatus.provider ?? "groq"} · Unlimited generations
                  </p>
                </div>
                <button
                  type="button"
                  disabled={savingByok}
                  onClick={handleDeleteByok}
                  className="px-2.5 py-1 text-[10px] font-mono uppercase text-n-text3 hover:text-red-400 border border-n-border hover:border-red-900/50 rounded-sm transition-colors"
                >
                  {savingByok ? "Removing…" : "Remove Key"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="password"
                placeholder="••••••••••••••••"
                value={byokInput}
                onChange={(e) => setByokInput(e.target.value)}
                className="w-full bg-n-surface border border-n-border text-white text-xs p-2.5 rounded-sm font-mono outline-none focus:border-white/50"
              />
              <button
                type="button"
                disabled={savingByok || !byokInput.trim()}
                onClick={handleSaveByok}
                className="btn-primary w-full text-xs"
              >
                {savingByok ? "Encrypting & Saving…" : "Save Groq Key"}
              </button>
            </div>
          )}
        </section>

        {/* Usage Ledger */}
        <section className="glass p-5 space-y-3">
          <p className="text-n-text3 text-[9px] uppercase tracking-[0.18em]">
            recent usage ledger
          </p>
          {usageLedger.length === 0 ? (
            <p className="text-n-text3 text-xs">No credit events recorded yet.</p>
          ) : (
            <div className="border border-n-border rounded-sm divide-y divide-n-border">
              {usageLedger.map((entry) => (
                <div
                  key={entry.id}
                  className="px-3.5 py-2.5 flex items-center justify-between text-xs font-mono"
                >
                  <span className="text-n-text2 truncate">{entry.action_kind}</span>
                  <span className="text-white shrink-0">-{entry.credits_charged} cr</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

