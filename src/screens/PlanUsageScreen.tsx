import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CREDIT_COSTS_BY_CLASS, PLANS, type CreditCostClass } from "@/config/plans";
import { createDefaultEntitlement, getPlanConfig, getRemainingCredits } from "@/lib/credits";
import { downloadAppExport, useAppStore } from "@/lib/zustandStore";

const COST_LABELS: Record<CreditCostClass, string> = {
  generation: "Generate / Edit App",
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
    <div className="min-h-screen flex flex-col bg-gradient-mesh">
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

          {/* Active apps meter */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-n-text2">ACTIVE APPS</span>
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
                {sleepingApps.length} sleeping app{sleepingApps.length !== 1 ? "s" : ""} (never deleted — exportable anytime)
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

        {/* Manage Active & Sleeping Apps */}
        <section className="glass p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-n-text3 text-[9px] uppercase tracking-[0.18em]">
              apps ({activeApps.length} active · {sleepingApps.length} sleeping)
            </p>
          </div>

          {apps.length === 0 ? (
            <p className="text-n-text3 text-xs">No saved apps yet.</p>
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

