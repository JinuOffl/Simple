import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { downloadAppExport, useAppStore } from "@/lib/zustandStore";
import type { SavedApp } from "@/lib/zustandStore";
import { ToolTile } from "@/components/ToolTile";
import { getToolStatus } from "@/lib/toolStatus";
import { migrateV1toV2, needsMigration } from "@/schema/migrator";
import type { Manifest } from "@/schema/manifest.v1";
import type { ManifestV2 } from "@/schema/manifest.v2";

const EXAMPLE_PROMPTS = [
  { emoji: "👗", label: "outfit recommender", prompt: "Create an outfit recommender tool that lets me take a photo of my clothes and get a style recommendation" },
  { emoji: "🎓", label: "feynman tutor",      prompt: "Build a Feynman tutoring tool where I pick a topic and it quizzes me with probing questions using voice" },
  { emoji: "✅", label: "habit tracker",       prompt: "Make a daily habit tracker with a checklist of habits I can check off each day" },
  { emoji: "🌍", label: "spanish quiz",        prompt: "Create a multiple choice quiz tool for learning Spanish verbs with 5 questions" },
];

function AppCard({
  app,
  onOpen,
  onSleep,
  onWake,
  onExport,
}: {
  app: SavedApp;
  onOpen: () => void;
  onSleep: () => void;
  onWake: () => void;
  onExport: () => void;
}) {
  const isSleeping = app.status === "sleeping";
  const spanClass = (app.manifest as any)?.tool?.size === "1x1" ? "col-span-1 row-span-1" : "col-span-2 row-span-1";

  return (
    <div
      className={`app-icon-card group justify-between !pt-2 !pb-2 ${spanClass} !aspect-auto ${isSleeping ? "opacity-50" : ""}`}
      onClick={onOpen}
      data-testid="app-card"
    >
      {/* Top action bar */}
      <div className="w-full flex items-center justify-between gap-1 min-h-[18px]">
        {isSleeping ? (
          <span className="nt-tag text-[8px] px-1.5 py-0.5 leading-none">
            sleeping
          </span>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onExport();
            }}
            title="Export JSON"
            aria-label={`Export ${app.name}`}
            className={`px-1 py-0.5 text-[9px] text-n-text3 hover:text-white transition-all duration-150 ${
              isSleeping ? "opacity-100" : "opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
            }`}
          >
            ↓
          </button>

          {!isSleeping && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSleep();
              }}
              title="Put tool to sleep"
              aria-label={`Sleep ${app.name}`}
              className="px-1 py-0.5 text-[9px] text-n-text3 hover:text-white
                         opacity-60 sm:opacity-0 sm:group-hover:opacity-100
                         transition-all duration-150"
            >
              ☾
            </button>
          )}
        </div>
      </div>

      {/* App icon + title */}
      <div className="flex flex-col items-center gap-1.5 my-auto w-full">
        <span className="text-3xl leading-none">{app.icon}</span>
        <p className="text-n-text2 text-[9px] uppercase tracking-wider text-center leading-tight line-clamp-2 w-full px-1">
          {app.name}
        </p>
      </div>

      {/* Wake button for sleeping apps */}
      {isSleeping && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onWake();
          }}
          className="w-full py-1 text-[8px] uppercase tracking-wider text-white
                     border border-n-border2 hover:bg-white hover:text-n-bg
                     rounded-sm transition-colors"
        >
          Wake
        </button>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="col-span-2 row-span-1 bg-n-surface border border-n-border rounded-sm flex flex-col items-center justify-center gap-2 p-3">
      <div className="skeleton w-8 h-8 rounded-sm" />
      <div className="skeleton w-12 h-2 rounded-sm" />
    </div>
  );
}

export function HomeScreen() {
  const navigate = useNavigate();
  const {
    apps,
    loadingApps,
    entitlement,
    lastLimitError,
    clearLimitError,
    fetchApps,
    fetchEntitlementAndUsage,
    sleepApp,
    wakeApp,
    exportApp,
    resetBuilder,
    session,
    signOut,
  } = useAppStore();

  useEffect(() => {
    void fetchApps();
    void fetchEntitlementAndUsage();
  }, [fetchApps, fetchEntitlementAndUsage]);

  const activeCount = apps.filter((a) => (a.status ?? "active") === "active").length;
  const activeLimit = entitlement?.active_app_limit ?? 3;

  const handleStartBuilder = (prefillPrompt?: string) => {
    resetBuilder();
    navigate("/build", { state: { prefillPrompt } });
  };

  const handleOpen = (app: SavedApp) => navigate(`/app/${app.id}`);

  const handleSleep = async (app: SavedApp) => {
    if (!confirm(`Put "${app.name}" to sleep? You can wake or export it anytime.`)) return;
    await sleepApp(app.id);
  };

  const handleWake = async (app: SavedApp) => {
    await wakeApp(app.id);
  };

  const handleExport = (app: SavedApp) => {
    downloadAppExport(app, exportApp);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-mesh">

      {/* Header */}
      <header className="px-5 pt-6 pb-4 flex items-end justify-between border-b border-n-border">
        <div>
          {/* Simple. in Doto dot-matrix */}
          <h1
            className="font-doto text-white tracking-widest leading-none"
            style={{ fontSize: "36px", fontVariationSettings: "'ROND' 0" }}
          >
            Simple.
          </h1>
          <p className="text-n-text3 text-[9px] uppercase tracking-[0.18em] mt-1.5">
            {apps.length > 0 ? `${apps.length} tool${apps.length !== 1 ? "s" : ""}` : "your mini-tools"}
          </p>
        </div>

        {/* Plan, MCP demo & account */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/plan")}
            className="nt-tag hover:border-n-border2 hover:text-n-text2 transition-colors cursor-pointer"
          >
            {activeCount}/{activeLimit} · {entitlement?.plan ?? "free"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/connections")}
            className="nt-tag hover:border-n-border2 hover:text-n-text2 transition-colors cursor-pointer"
          >
            connections
          </button>
          <button
            type="button"
            onClick={() => navigate("/mcp-demo")}
            className="nt-tag hover:border-n-border2 hover:text-n-text2 transition-colors cursor-pointer"
          >
            mcp demo
          </button>
          <button
            onClick={signOut}
            className="nt-tag hover:border-n-border2 hover:text-n-text2 transition-colors cursor-pointer"
          >
            {session?.user.is_anonymous ||
            session?.user.user_metadata?.is_guest ||
            session?.user.id.startsWith("guest-")
              ? "guest (sign out)"
              : (session?.user.email?.split("@")[0] ?? "account")}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-5 pb-28 overflow-y-auto mt-5">
        {lastLimitError && (
          <div className="mb-4 bg-n-surface border border-white/30 rounded-sm px-4 py-3 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs text-white leading-relaxed">{lastLimitError}</p>
              <button
                type="button"
                onClick={() => {
                  clearLimitError();
                  navigate("/plan");
                }}
                className="text-[10px] font-mono uppercase tracking-wider text-n-text2 hover:text-white underline"
              >
                manage plan & sleeping tools →
              </button>
            </div>
            <button
              type="button"
              onClick={clearLimitError}
              className="text-n-text3 hover:text-white text-xs shrink-0"
              aria-label="Dismiss limit error"
            >
              ✕
            </button>
          </div>
        )}

        {loadingApps ? (
          <div className="grid grid-cols-4 gap-2 auto-rows-[88px] [grid-auto-flow:dense]">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : apps.length === 0 ? (
          /* ── Empty state ── */
          <div className="flex flex-col gap-6 animate-fade-in">
            {/* dot-matrix "empty" label */}
            <div className="py-4 text-center">
              <p
                className="font-doto text-n-text3 tracking-widest"
                style={{ fontSize: "22px", fontVariationSettings: "'ROND' 0" }}
              >
                NO TOOLS YET
              </p>
              <p className="text-n-text3 text-[10px] uppercase tracking-wider mt-2">
                tap a prompt below to start
              </p>
            </div>

            {/* Example prompts — Nothing-style list */}
            <div>
              <p className="text-n-text3 text-[9px] uppercase tracking-[0.18em] mb-3">
                try these
              </p>
              <div className="border border-n-border rounded-sm overflow-hidden">
                {EXAMPLE_PROMPTS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => handleStartBuilder(p.prompt)}
                    className="w-full flex items-center gap-3 px-4 py-3.5
                               border-b border-n-border last:border-b-0
                               hover:bg-n-surface active:bg-n-surface2
                               transition-colors text-left"
                  >
                    <span className="text-lg flex-shrink-0 w-7">{p.emoji}</span>
                    <span className="text-n-text2 text-[11px] uppercase tracking-wider flex-1">
                      {p.label}
                    </span>
                    <span className="text-n-text3 text-[10px]">→</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ── Tool grid ── */
          <div className="grid grid-cols-4 gap-2 auto-rows-[88px] [grid-auto-flow:dense] animate-fade-in">
            {apps.map((app) => {
              const isSleeping = app.status === "sleeping";
              if (isSleeping) {
                return (
                  <AppCard
                    key={app.id}
                    app={app}
                    onOpen={() => handleOpen(app)}
                    onSleep={() => handleSleep(app)}
                    onWake={() => handleWake(app)}
                    onExport={() => handleExport(app)}
                  />
                );
              }

              const v2Manifest = needsMigration(app.manifest)
                ? migrateV1toV2(app.manifest as Manifest)
                : (app.manifest as ManifestV2);

              return (
                <ToolTile
                  key={app.id}
                  manifest={v2Manifest}
                  status={getToolStatus(v2Manifest)}
                  onOpen={() => handleOpen(app)}
                  onSleep={() => handleSleep(app)}
                  onExport={() => handleExport(app)}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* FAB — white circle with black + */}
      <div className="fixed bottom-8 right-5 z-10">
        <button
          onClick={() => handleStartBuilder()}
          id="create-app-fab"
          className="w-14 h-14 bg-white rounded-full flex items-center justify-center
                     transition-all duration-150 active:scale-90 hover:opacity-90"
          style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.1)" }}
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="#0a0a0a" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>
    </div>
  );
}
