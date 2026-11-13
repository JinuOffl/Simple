import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { downloadAppExport, useAppStore } from "@/lib/zustandStore";
import type { SavedApp } from "@/lib/zustandStore";
import { ManifestRenderer } from "@/renderer/ManifestRenderer";
import type { Manifest } from "@/schema/manifest.v1";
import type { ManifestV2 } from "@/schema/manifest.v2";
import { ShareModal } from "@/components/ShareModal";

export function AppRunnerScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { apps, user, startEditing, wakeApp, exportApp } = useAppStore();

  const [app, setApp]         = useState<SavedApp | null>(null);
  const [appData, setAppData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [wakeError, setWakeError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<"owner" | "editor" | "viewer">("owner");
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      const cached = apps.find((a) => a.id === id);
      let loadedApp: SavedApp | null = cached ?? null;

      if (!loadedApp && user?.id.startsWith("guest-")) {
        try {
          const stored = localStorage.getItem(`simple_guest_apps_${user.id}`);
          if (stored) {
            const guestApps: SavedApp[] = JSON.parse(stored);
            loadedApp = guestApps.find((a) => a.id === id) ?? null;
          }
        } catch {
          // ignore
        }
      }

      if (!loadedApp) {
        const { data, error } = await supabase.from("apps").select("*").eq("id", id).single();
        if (error || !data) { setError("App not found"); setLoading(false); return; }
        const raw = data as SavedApp;
        loadedApp = { ...raw, status: raw.status ?? "active" };
      }

      setApp(loadedApp);

      if (loadedApp && user) {
        if (loadedApp.user_id === user.id) {
          setUserRole("owner");
        } else {
          const { data: memData } = await supabase
            .from("app_members")
            .select("role")
            .eq("app_id", id)
            .eq("user_id", user.id)
            .maybeSingle();
          if (memData?.role) {
            setUserRole(memData.role as "owner" | "editor" | "viewer");
          }
        }
      }

      if (user?.id.startsWith("guest-")) {
        try {
          const localDataRaw = localStorage.getItem(`simple_guest_data_${id}`);
          if (localDataRaw) {
            setAppData(JSON.parse(localDataRaw));
          }
        } catch {
          // ignore
        }
      } else {
        const { data: dataRows } = await supabase.from("app_data").select("key, value").eq("app_id", id);
        if (dataRows) {
          const merged: Record<string, unknown> = {};
          for (const row of dataRows) merged[row.key] = row.value;
          setAppData(merged);
        }
      }

      setLoading(false);
    };
    load();

    // Subscribe to live Realtime updates on app_data
    const channel = supabase
      .channel(`app-data-sync-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_data", filter: `app_id=eq.${id}` },
        (payload) => {
          if (payload.new && typeof payload.new === "object" && "key" in payload.new) {
            const row = payload.new as { key: string; value: unknown };
            setAppData((prev) => ({ ...prev, [row.key]: row.value }));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, apps, user]);

  const handleDataChange = async (key: string, value: unknown) => {
    if (userRole === "viewer") return;
    setAppData(prev => ({ ...prev, [key]: value }));
    if (!id) return;

    if (user?.id.startsWith("guest-")) {
      try {
        const raw = localStorage.getItem(`simple_guest_data_${id}`);
        const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        data[key] = value;
        localStorage.setItem(`simple_guest_data_${id}`, JSON.stringify(data));
      } catch {
        // ignore
      }
      return;
    }

    await supabase.from("app_data").upsert(
      { app_id: id, key, value, updated_at: new Date().toISOString() },
      { onConflict: "app_id,key" }
    );
  };

  const handleEdit = () => {
    if (userRole === "viewer") return;
    if (app) { startEditing(app); navigate("/build"); }
  };

  const handleWake = async () => {
    if (!app) return;
    setWakeError(null);
    const res = await wakeApp(app.id);
    if (!res.ok) {
      setWakeError(res.error ?? "Unable to wake app.");
      return;
    }
    const updatedFromStore = useAppStore.getState().apps.find((a) => a.id === app.id);
    if (updatedFromStore) {
      setApp(updatedFromStore);
    } else {
      setApp({ ...app, status: "active" });
    }
  };

  const handleExport = () => {
    if (!app) return;
    downloadAppExport(app, exportApp);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-mesh">
        <div className="flex flex-col items-center gap-4">
          <p
            className="font-doto text-n-text3 tracking-widest animate-pulse-slow"
            style={{ fontSize: "16px", fontVariationSettings: "'ROND' 0" }}
          >
            LOADING
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

  if (error || !app) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 bg-gradient-mesh">
        <p className="font-doto text-n-text3 tracking-widest text-xl"
           style={{ fontVariationSettings: "'ROND' 0" }}>
          NOT FOUND
        </p>
        <button onClick={() => navigate("/")} className="btn-ghost">← BACK HOME</button>
      </div>
    );
  }

  const appManifest: Manifest | ManifestV2 = app.manifest;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-mesh">

      {/* Top bar */}
      <header className="px-4 pt-5 pb-3 flex items-center gap-3 border-b border-n-border">
        <button
          onClick={() => navigate("/")}
          className="text-n-text3 hover:text-white text-[11px] uppercase tracking-wider transition-colors"
        >
          ←
        </button>

        <div className="flex-1 flex items-center gap-2.5">
          <span className="text-xl leading-none">{app.icon}</span>
          <p className="text-white text-xs uppercase tracking-wider">{app.name}</p>
          {userRole !== "owner" && (
            <span className="nt-tag text-[9px] uppercase tracking-wider px-1.5 py-0.5">
              {userRole}
            </span>
          )}
        </div>

        {userRole === "owner" && (
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className="text-n-text3 hover:text-white text-[10px] uppercase tracking-widest
                       border border-n-border hover:border-n-border2 px-3 py-1.5 rounded-sm
                       transition-colors"
          >
            share
          </button>
        )}

        {userRole !== "viewer" && (
          <button
            type="button"
            onClick={handleEdit}
            className="text-n-text3 hover:text-white text-[10px] uppercase tracking-widest
                       border border-n-border hover:border-n-border2 px-3 py-1.5 rounded-sm
                       transition-colors"
          >
            edit
          </button>
        )}
      </header>

      {/* App content */}
      <main className="flex-1 overflow-y-auto">
        {app.status === "sleeping" ? (
          <div className="p-6 flex items-center justify-center min-h-[60vh]">
            <div className="glass max-w-sm w-full p-6 flex flex-col items-center text-center gap-4">
              <span className="text-4xl leading-none">{app.icon}</span>
              <div>
                <span className="nt-tag mb-2">sleeping</span>
                <h2 className="text-white text-sm uppercase tracking-wider font-semibold">
                  {app.name}
                </h2>
                <p className="text-n-text2 text-xs mt-1.5 leading-relaxed">
                  This app is sleeping. Wake it up to use it again, or export its manifest as JSON.
                </p>
              </div>
              <div className="w-full flex flex-col gap-2 pt-2">
                {wakeError && (
                  <p className="text-[11px] text-white/90 bg-n-surface border border-white/25 rounded-sm px-3 py-2 text-left leading-relaxed">
                    {wakeError}
                  </p>
                )}
                <button type="button" onClick={handleWake} className="btn-primary">
                  Wake App
                </button>
                <button type="button" onClick={handleExport} className="btn-ghost w-full">
                  Export JSON
                </button>
                {wakeError && (
                  <button
                    type="button"
                    onClick={() => navigate("/plan")}
                    className="btn-ghost w-full text-[10px]"
                  >
                    Manage Plan & Active Apps →
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <ManifestRenderer
            manifest={appManifest}
            appData={appData}
            appId={app.id}
            onDataChange={handleDataChange}
            isPreview={false}
          />
        )}
      </main>

      {showShareModal && (
        <ShareModal
          appId={app.id}
          appName={app.name}
          isOwner={userRole === "owner"}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
}
