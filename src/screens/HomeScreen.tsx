import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { downloadAppExport, useAppStore } from "@/lib/zustandStore";
import type { SavedApp } from "@/lib/zustandStore";

const EXAMPLE_PROMPTS = [
  { emoji: "👗", label: "outfit recommender", prompt: "Create an outfit recommender app that lets me take a photo of my clothes and get a style recommendation" },
  { emoji: "🎓", label: "feynman tutor",      prompt: "Build a Feynman tutoring app where I pick a topic and it quizzes me with probing questions using voice" },
  { emoji: "✅", label: "habit tracker",       prompt: "Make a daily habit tracker with a checklist of habits I can check off each day" },
  { emoji: "🌍", label: "spanish quiz",        prompt: "Create a multiple choice quiz app for learning Spanish verbs with 5 questions" },
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

  return (
    <div
      className={`app-icon-card group justify-between !pt-2 !pb-2 ${isSleeping ? "opacity-50" : ""}`}
      onClick={onOpen}
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
              title="Put app to sleep"
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
    <div className="aspect-square bg-n-surface border border-n-border rounded-sm
                    flex flex-col items-center justify-center gap-2 p-3">
      <div className="skeleton w-8 h-8 rounded-sm" />
      <div className="skeleton w-12 h-2 rounded-sm" />
    </div>
  );
}

export function HomeScreen() {
  const navigate = useNavigate();
  const { apps, loadingApps, fetchApps, sleepApp, wakeApp, exportApp, resetBuilder, session, signOut } =
    useAppStore();

  useEffect(() => { fetchApps(); }, [fetchApps]);

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
          {/* SIMPLE in Doto dot-matrix */}
          <h1
            className="font-doto text-white tracking-widest leading-none"
            style={{ fontSize: "36px", fontVariationSettings: "'ROND' 0" }}
          >
            SIMPLE
          </h1>
          <p className="text-n-text3 text-[9px] uppercase tracking-[0.18em] mt-1.5">
            {apps.length > 0 ? `${apps.length} app${apps.length !== 1 ? "s" : ""}` : "your mini-apps"}
          </p>
        </div>

        {/* MCP demo & account */}
        <div className="flex items-center gap-2">
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
            {session?.user.email?.split("@")[0] ?? "account"}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-5 pb-28 overflow-y-auto mt-5">
        {loadingApps ? (
          <div className="grid grid-cols-3 gap-2">
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
                NO APPS YET
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
          /* ── App grid ── */
          <div className="grid grid-cols-3 gap-2 animate-fade-in">
            {apps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                onOpen={() => handleOpen(app)}
                onSleep={() => handleSleep(app)}
                onWake={() => handleWake(app)}
                onExport={() => handleExport(app)}
              />
            ))}
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
