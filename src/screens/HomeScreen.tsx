import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { downloadAppExport, useAppStore } from "@/lib/zustandStore";
import type { SavedApp } from "@/lib/zustandStore";
import { ToolTile } from "@/components/ToolTile";
import { getToolStatus } from "@/lib/toolStatus";
import { isLocalGuestSession } from "@/lib/guestAuth";
import { supabase } from "@/lib/supabaseClient";
import { migrateV1toV2, needsMigration } from "@/schema/migrator";
import type { Manifest } from "@/schema/manifest.v1";
import type { ManifestV2 } from "@/schema/manifest.v2";
import { STARTER_TEMPLATES } from "../../supabase/functions/_shared/orchestrator/templates.ts";
import type { StarterTemplate } from "../../supabase/functions/_shared/orchestrator/types.ts";

const DEMO_TEMPLATE_SLUGS = [
  "habit-heatmap",
  "pomodoro",
  "counter",
  "world-clock",
  "weather-forecast",
  "currency-converter",
] as const;

const DEMO_TEMPLATES: StarterTemplate[] = DEMO_TEMPLATE_SLUGS.map((slug) => {
  const tpl = STARTER_TEMPLATES.find((t) => t.slug === slug);
  if (!tpl) throw new Error(`Missing demo template: ${slug}`);
  return tpl;
});

const BUILD_WITH_AI_PROMPTS = [
  { emoji: "💧", label: "water intake checklist", prompt: "Make a daily water intake checklist" },
  { emoji: "🌤️", label: "london weather with refresh", prompt: "Show London weather with a refresh button" },
  { emoji: "⏱️", label: "study timer with checklist", prompt: "A study timer with 45 minutes and a topics checklist" },
];

function TemplateCard({
  template,
  onClone,
  isCloning,
}: {
  template: StarterTemplate;
  onClone: () => void;
  isCloning?: boolean;
}) {
  const size = (template.manifest as any)?.tool?.size ?? "2x1";
  return (
    <button
      type="button"
      onClick={onClone}
      disabled={isCloning}
      aria-label={`Clone template: ${template.name}`}
      className="group w-full text-left p-3.5 bg-n-surface border border-n-border hover:border-white rounded-sm
                 transition-all duration-150 flex flex-col justify-between gap-3 active:scale-[0.99] cursor-pointer"
    >
      <div className="space-y-1.5 w-full">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl leading-none">{template.icon}</span>
            <span className="font-mono text-xs uppercase tracking-wider text-white group-hover:text-white transition-colors font-semibold">
              {template.name}
            </span>
          </div>
          <span className="nt-tag text-[8px] px-1.5 py-0.5 uppercase tracking-widest text-n-text3">
            {size}
          </span>
        </div>
        <p className="text-n-text3 text-[10px] leading-relaxed line-clamp-2 font-mono">
          {template.description}
        </p>
      </div>

      <div className="pt-2 border-t border-n-border/50 flex items-center justify-between text-[9px] font-mono text-n-text3 group-hover:text-white transition-colors">
        <span className="uppercase tracking-widest">Instant Demo</span>
        <span>{isCloning ? "CLONING..." : "USE TEMPLATE →"}</span>
      </div>
    </button>
  );
}

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
    saveApp,
  } = useAppStore();

  const [appsData, setAppsData] = useState<Record<string, Record<string, unknown>>>({});
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [cloningSlug, setCloningSlug] = useState<string | null>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const previousTemplatesFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (showTemplatesModal) {
      previousTemplatesFocusRef.current = document.activeElement as HTMLElement | null;
    } else if (previousTemplatesFocusRef.current) {
      previousTemplatesFocusRef.current.focus?.();
      previousTemplatesFocusRef.current = null;
    }
  }, [showTemplatesModal]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    if (accountMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [accountMenuOpen]);

  useEffect(() => {
    void fetchApps();
    void fetchEntitlementAndUsage();
  }, [fetchApps, fetchEntitlementAndUsage]);

  useEffect(() => {
    let isMounted = true;
    async function loadAllAppsData() {
      const activeApps = apps.filter((a) => (a.status ?? "active") === "active");
      if (activeApps.length === 0) {
        if (isMounted) setAppsData({});
        return;
      }

      const isGuest =
        session?.user.is_anonymous ||
        session?.user.user_metadata?.is_guest ||
        session?.user.id.startsWith("guest-") ||
        isLocalGuestSession(session);

      if (isGuest) {
        const guestMap: Record<string, Record<string, unknown>> = {};
        for (const app of activeApps) {
          try {
            const raw = localStorage.getItem(`simple_guest_data_${app.id}`);
            if (raw) {
              guestMap[app.id] = JSON.parse(raw);
            }
          } catch {
            // ignore
          }
        }
        if (isMounted) setAppsData(guestMap);
        return;
      }

      try {
        const activeIds = activeApps.map((a) => a.id);
        const { data, error } = await supabase
          .from("app_data")
          .select("app_id, key, value")
          .in("app_id", activeIds);

        if (!error && data && isMounted) {
          const map: Record<string, Record<string, unknown>> = {};
          for (const row of data as Array<{ app_id: string; key: string; value: unknown }>) {
            if (!map[row.app_id]) map[row.app_id] = {};
            map[row.app_id][row.key] = row.value;
          }
          setAppsData(map);
        }
      } catch {
        // loading-safe
      }
    }

    void loadAllAppsData();
    return () => {
      isMounted = false;
    };
  }, [apps, session]);

  const isLocalGuest = isLocalGuestSession(session);
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

  const handleCloneTemplate = async (template: StarterTemplate) => {
    try {
      setCloningSlug(template.slug);
      const newAppId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `app-${Date.now()}`;

      const clonedManifest: ManifestV2 = {
        ...(structuredClone(template.manifest) as ManifestV2),
        app_id: newAppId,
      };

      const saved = await saveApp(clonedManifest);
      if (saved) {
        setShowTemplatesModal(false);
        navigate(`/app/${saved.id}`);
      }
    } finally {
      setCloningSlug(null);
    }
  };

  const isGuest =
    session?.user.is_anonymous ||
    session?.user.user_metadata?.is_guest ||
    session?.user.id.startsWith("guest-");
  const accountLabel = isGuest ? "guest" : (session?.user.email?.split("@")[0] ?? "account");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gradient-mesh">

      {/* Header */}
      <header className="px-4 sm:px-5 pt-5 pb-3 flex items-end justify-between border-b border-n-border gap-2">
        <div className="shrink-0 min-w-0">
          {/* Simple. in Doto dot-matrix */}
          <h1
            className="font-doto text-white tracking-widest leading-none text-2xl sm:text-3xl"
            style={{ fontVariationSettings: "'ROND' 0" }}
          >
            Simple.
          </h1>
          <p className="text-n-text3 text-[9px] uppercase tracking-[0.18em] mt-1 truncate">
            {apps.length > 0 ? `${apps.length} tool${apps.length !== 1 ? "s" : ""}` : "your mini-tools"}
          </p>
        </div>

        {/* Plan & Account dropdown */}
        <div className="flex items-center gap-1.5 shrink-0">
          {apps.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTemplatesModal(true)}
              className="nt-tag hover:border-n-border2 hover:text-white transition-colors cursor-pointer text-[9px] uppercase tracking-wider"
            >
              templates
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate("/plan")}
            className="nt-tag hover:border-n-border2 hover:text-n-text2 transition-colors cursor-pointer text-[9px]"
          >
            {activeCount}/{activeLimit} · {entitlement?.plan ?? "free"}
          </button>

          <div className="relative" ref={accountMenuRef}>
            <button
              type="button"
              onClick={() => setAccountMenuOpen((prev) => !prev)}
              aria-label="Account menu"
              aria-expanded={accountMenuOpen}
              className="nt-tag hover:border-n-border2 hover:text-n-text2 transition-colors cursor-pointer text-[9px] flex items-center gap-1"
            >
              <span>{accountLabel}</span>
              <span className="text-[7px]">▾</span>
            </button>

            {accountMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1.5 w-40 bg-n-surface border border-n-border rounded-sm shadow-2xl z-30 py-1 text-xs animate-fade-in font-mono"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    navigate("/connections");
                  }}
                  className="w-full text-left px-3 py-2 text-n-text2 hover:text-white hover:bg-n-surface2 uppercase tracking-wider text-[10px]"
                >
                  Connections
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    navigate("/plan");
                  }}
                  className="w-full text-left px-3 py-2 text-n-text2 hover:text-white hover:bg-n-surface2 uppercase tracking-wider text-[10px]"
                >
                  Plan & usage
                </button>
                <div className="h-[1px] bg-n-border my-1" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    void signOut();
                  }}
                  className="w-full text-left px-3 py-2 text-red-400 hover:text-red-300 hover:bg-n-surface2 uppercase tracking-wider text-[10px]"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-5 pb-28 overflow-y-auto mt-5">
        {isLocalGuest && (
          <div
            data-testid="offline-guest-notice"
            className="mb-4 bg-n-surface border border-white/40 rounded-sm px-4 py-3 flex items-center justify-between gap-3 text-xs animate-slide-up"
          >
            <span className="text-white">
              Guest mode is offline. Sign in with email to build tools.
            </span>
            <button
              type="button"
              onClick={() => navigate("/auth")}
              className="text-[10px] font-mono uppercase tracking-wider text-white border border-n-border px-2 py-1 rounded-sm hover:border-white transition-colors cursor-pointer shrink-0"
            >
              SIGN IN →
            </button>
          </div>
        )}

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
          <div className="flex flex-col gap-8 animate-fade-in max-w-3xl mx-auto w-full">
            {/* dot-matrix "empty" label */}
            <div className="py-4 text-center">
              <p
                className="font-doto text-n-text3 tracking-widest"
                style={{ fontSize: "22px", fontVariationSettings: "'ROND' 0" }}
              >
                NO TOOLS YET
              </p>
              <p className="text-n-text3 text-[10px] uppercase tracking-wider mt-2">
                tap a prompt below to start or clone a starter template
              </p>
            </div>

            {/* Gallery of 6 starter templates */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-n-text3 text-[9px] uppercase tracking-[0.18em]">
                  starter templates · instant demo
                </p>
                <span className="text-[9px] font-mono text-n-text3">6 available</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {DEMO_TEMPLATES.map((tpl) => (
                  <TemplateCard
                    key={tpl.slug}
                    template={tpl}
                    onClone={() => void handleCloneTemplate(tpl)}
                    isCloning={cloningSlug === tpl.slug}
                  />
                ))}
              </div>
            </div>

            {/* Build with AI section */}
            <div>
              <p className="text-n-text3 text-[9px] uppercase tracking-[0.18em] mb-3">
                build with ai
              </p>
              <div className="border border-n-border rounded-sm overflow-hidden">
                {BUILD_WITH_AI_PROMPTS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => handleStartBuilder(p.prompt)}
                    className="w-full flex items-center gap-3 px-4 py-3.5
                               border-b border-n-border last:border-b-0
                               hover:bg-n-surface active:bg-n-surface2
                               transition-colors text-left cursor-pointer"
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
                  appData={appsData[app.id] ?? {}}
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
      <div className="fixed bottom-8 right-5 z-10 pb-[env(safe-area-inset-bottom)]">
        <button
          onClick={() => handleStartBuilder()}
          id="create-app-fab"
          aria-label="Create tool"
          className="w-14 h-14 bg-white rounded-full flex items-center justify-center
                     transition-all duration-150 active:scale-90 hover:opacity-90"
          style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.1)" }}
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="#0a0a0a" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* Templates Modal */}
      {showTemplatesModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="templates-modal-title"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
        >
          <div className="w-full max-w-2xl bg-n-surface border border-n-border rounded-sm max-h-[85dvh] flex flex-col shadow-2xl">
            {/* Modal header */}
            <div className="px-5 py-4 border-b border-n-border flex items-center justify-between">
              <div>
                <h2
                  id="templates-modal-title"
                  className="font-doto text-white tracking-widest text-sm uppercase"
                  style={{ fontVariationSettings: "'ROND' 0" }}
                >
                  STARTER TEMPLATES
                </h2>
                <p className="text-n-text3 text-[9px] uppercase tracking-wider mt-0.5">
                  Clone an instant mini-tool · no credits used
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTemplatesModal(false)}
                aria-label="Close dialog"
                className="w-7 h-7 flex items-center justify-center border border-n-border hover:border-white text-n-text3 hover:text-white rounded-sm text-xs transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Gallery grid */}
            <div className="p-5 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DEMO_TEMPLATES.map((tpl) => (
                <TemplateCard
                  key={tpl.slug}
                  template={tpl}
                  onClone={() => void handleCloneTemplate(tpl)}
                  isCloning={cloningSlug === tpl.slug}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
