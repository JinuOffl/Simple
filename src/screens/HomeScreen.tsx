import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/lib/zustandStore";
import type { SavedApp } from "@/lib/zustandStore";

const EXAMPLE_PROMPTS = [
  { emoji: "👗", label: "outfit recommender", prompt: "Create an outfit recommender app that lets me take a photo of my clothes and get a style recommendation" },
  { emoji: "🎓", label: "feynman tutor",      prompt: "Build a Feynman tutoring app where I pick a topic and it quizzes me with probing questions using voice" },
  { emoji: "✅", label: "habit tracker",       prompt: "Make a daily habit tracker with a checklist of habits I can check off each day" },
  { emoji: "🌍", label: "spanish quiz",        prompt: "Create a multiple choice quiz app for learning Spanish verbs with 5 questions" },
];

function AppCard({ app, onOpen, onDelete }: { app: SavedApp; onOpen: () => void; onDelete: () => void }) {
  return (
    <div className="app-icon-card group" onClick={onOpen}>
      <span className="text-3xl leading-none">{app.icon}</span>
      <p className="text-n-text2 text-[9px] uppercase tracking-wider text-center leading-tight line-clamp-2 w-full px-1">
        {app.name}
      </p>
      {/* Delete on hover */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center
                   text-n-text3 hover:text-white opacity-0 group-hover:opacity-100
                   text-[10px] transition-all duration-150"
      >
        ✕
      </button>
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
  const { apps, loadingApps, fetchApps, deleteApp, resetBuilder, session, signOut } = useAppStore();

  useEffect(() => { fetchApps(); }, [fetchApps]);

  const handleStartBuilder = (prefillPrompt?: string) => {
    resetBuilder();
    navigate("/build", { state: { prefillPrompt } });
  };

  const handleOpen   = (app: SavedApp) => navigate(`/app/${app.id}`);
  const handleDelete = async (app: SavedApp) => {
    if (!confirm(`Delete "${app.name}"?`)) return;
    await deleteApp(app.id);
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

        {/* Settings / sign out */}
        <button
          onClick={signOut}
          className="nt-tag hover:border-n-border2 hover:text-n-text2 transition-colors cursor-pointer"
        >
          {session?.user.email?.split("@")[0] ?? "account"}
        </button>
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
                onDelete={() => handleDelete(app)}
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
