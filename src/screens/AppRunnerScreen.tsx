import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useAppStore } from "@/lib/zustandStore";
import type { SavedApp } from "@/lib/zustandStore";
import { ManifestRenderer } from "@/renderer/ManifestRenderer";
import type { Manifest } from "@/schema/manifest.schema";

export function AppRunnerScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { apps, startEditing } = useAppStore();

  const [app, setApp]         = useState<SavedApp | null>(null);
  const [appData, setAppData] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      const cached = apps.find((a) => a.id === id);
      let loadedApp: SavedApp | null = cached ?? null;

      if (!loadedApp) {
        const { data, error } = await supabase.from("apps").select("*").eq("id", id).single();
        if (error || !data) { setError("App not found"); setLoading(false); return; }
        loadedApp = data as SavedApp;
      }

      setApp(loadedApp);

      const { data: dataRows } = await supabase.from("app_data").select("key, value").eq("app_id", id);
      if (dataRows) {
        const merged: Record<string, unknown> = {};
        for (const row of dataRows) merged[row.key] = row.value;
        setAppData(merged);
      }

      setLoading(false);
    };
    load();
  }, [id, apps]);

  const handleDataChange = async (key: string, value: unknown) => {
    setAppData(prev => ({ ...prev, [key]: value }));
    if (id) {
      await supabase.from("app_data").upsert(
        { app_id: id, key, value, updated_at: new Date().toISOString() },
        { onConflict: "app_id,key" }
      );
    }
  };

  const handleEdit = () => {
    if (app) { startEditing(app); navigate("/build"); }
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
        </div>

        <button
          onClick={handleEdit}
          className="text-n-text3 hover:text-white text-[10px] uppercase tracking-widest
                     border border-n-border hover:border-n-border2 px-3 py-1.5 rounded-sm
                     transition-colors"
        >
          edit
        </button>
      </header>

      {/* App content */}
      <main className="flex-1 overflow-y-auto">
        <ManifestRenderer
          manifest={app.manifest as Manifest}
          appData={appData}
          appId={app.id}
          onDataChange={handleDataChange}
          isPreview={false}
        />
      </main>
    </div>
  );
}
