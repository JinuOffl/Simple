import { create } from "zustand";
import type { User, Session } from "@supabase/supabase-js";
import type { Manifest } from "@/schema/manifest.v1";
import type { ManifestV2 } from "@/schema/manifest.v2";
import { migrateV1toV2, needsMigration } from "@/schema/migrator";
import { supabase } from "./supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SavedApp {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  manifest: Manifest | ManifestV2;
  schema_version?: number;
  status?: "active" | "sleeping";
  pinned_order: number | null;
  created_at: string;
  updated_at: string;
}

interface AuthSlice {
  user: User | null;
  session: Session | null;
  setSession: (session: Session | null) => void;
  signOut: () => Promise<void>;
}

interface BuilderSlice {
  currentManifest: Manifest | ManifestV2 | null;
  conversationContext: Array<{ role: "user" | "assistant"; content: string }>;
  isGenerating: boolean;
  generationError: string | null;
  editingAppId: string | null; // set when editing an existing app

  setManifest: (manifest: Manifest | ManifestV2 | null) => void;
  setGenerating: (v: boolean) => void;
  setGenerationError: (e: string | null) => void;
  addMessage: (role: "user" | "assistant", content: string) => void;
  resetBuilder: () => void;
  startEditing: (app: SavedApp) => void;
}

interface AppCacheSlice {
  apps: SavedApp[];
  loadingApps: boolean;
  componentLoadingMap: Record<string, boolean>;

  fetchApps: () => Promise<void>;
  saveApp: (manifest: Manifest | ManifestV2, existingId?: string) => Promise<SavedApp | null>;
  sleepApp: (id: string) => Promise<void>;
  wakeApp: (id: string) => Promise<void>;
  exportApp: (app: SavedApp) => string;
  setComponentLoading: (componentId: string, loading: boolean) => void;
}

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

function normalizeSavedApp(row: SavedApp): SavedApp {
  return {
    ...row,
    status: row.status ?? "active",
    schema_version: row.schema_version ?? (needsMigration(row.manifest) ? 1 : 2),
  };
}

/**
 * Serialize a SavedApp into a portable v2 JSON export string.
 */
export function exportApp(app: SavedApp): string {
  const manifest = needsMigration(app.manifest)
    ? migrateV1toV2(app.manifest as Manifest)
    : (app.manifest as ManifestV2);

  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      schema_version: 2,
      app: {
        id: app.id,
        name: app.name,
        icon: app.icon,
        status: app.status ?? "active",
        manifest,
      },
    },
    null,
    2
  );
}

/**
 * Trigger a browser download of an exported v2 app manifest JSON file.
 */
export function downloadAppExport(
  app: SavedApp,
  serialize: (target: SavedApp) => string = exportApp
): void {
  const json = serialize(app);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const slug = app.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slug || "simple-app"}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ─── Store ────────────────────────────────────────────────────────────────────

type AppStore = AuthSlice & BuilderSlice & AppCacheSlice;

export const useAppStore = create<AppStore>((set, get) => ({
  // ── Auth ──────────────────────────────────────────────────────────────────
  user: null,
  session: null,

  setSession: (session) =>
    set({ session, user: session?.user ?? null }),

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, apps: [] });
  },

  // ── Builder ───────────────────────────────────────────────────────────────
  currentManifest: null,
  conversationContext: [],
  isGenerating: false,
  generationError: null,
  editingAppId: null,

  setManifest: (manifest) => set({ currentManifest: manifest }),

  setGenerating: (v) => set({ isGenerating: v, generationError: v ? null : get().generationError }),

  setGenerationError: (e) => set({ generationError: e }),

  addMessage: (role, content) =>
    set((s) => ({
      conversationContext: [...s.conversationContext, { role, content }],
    })),

  resetBuilder: () =>
    set({
      currentManifest: null,
      conversationContext: [],
      isGenerating: false,
      generationError: null,
      editingAppId: null,
    }),

  startEditing: (app) =>
    set({
      currentManifest: app.manifest,
      editingAppId: app.id,
      conversationContext: [],
      generationError: null,
    }),

  // ── App Cache ─────────────────────────────────────────────────────────────
  apps: [],
  loadingApps: false,
  componentLoadingMap: {},

  fetchApps: async () => {
    set({ loadingApps: true });
    const { data, error } = await supabase
      .from("apps")
      .select("*")
      .order("pinned_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetchApps error:", error);
    } else {
      set({ apps: ((data as SavedApp[] | null) ?? []).map(normalizeSavedApp) });
    }
    set({ loadingApps: false });
  },

  saveApp: async (manifest, existingId) => {
    const { user } = get();
    if (!user) return null;

    // Keep payload compatible with 001_initial_schema.sql until Phase 2 migration runs
    const payload = {
      user_id: user.id,
      name: manifest.name,
      icon: manifest.icon,
      manifest: manifest as unknown as Record<string, unknown>,
    };

    let result: SavedApp | null = null;

    if (existingId) {
      // Update existing app
      const { data, error } = await supabase
        .from("apps")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", existingId)
        .select()
        .single();

      if (error) { console.error("saveApp update error:", error); return null; }
      result = normalizeSavedApp(data as SavedApp);

      set((s) => ({
        apps: s.apps.map((a) => (a.id === existingId ? result! : a)),
      }));
    } else {
      // Insert new app
      const { data, error } = await supabase
        .from("apps")
        .insert(payload)
        .select()
        .single();

      if (error) { console.error("saveApp insert error:", error); return null; }
      result = normalizeSavedApp(data as SavedApp);

      set((s) => ({ apps: [result!, ...s.apps] }));
    }

    return result;
  },

  sleepApp: async (id) => {
    const { error } = await supabase
      .from("apps")
      .update({ status: "sleeping" })
      .eq("id", id);

    if (error) {
      console.error("sleepApp error:", error);
      return;
    }

    set((s) => ({
      apps: s.apps.map((a) => (a.id === id ? { ...a, status: "sleeping" } : a)),
    }));
  },

  wakeApp: async (id) => {
    const { error } = await supabase
      .from("apps")
      .update({ status: "active" })
      .eq("id", id);

    if (error) {
      console.error("wakeApp error:", error);
      return;
    }

    set((s) => ({
      apps: s.apps.map((a) => (a.id === id ? { ...a, status: "active" } : a)),
    }));
  },

  exportApp,

  setComponentLoading: (componentId, loading) =>
    set((s) => ({
      componentLoadingMap: { ...s.componentLoadingMap, [componentId]: loading },
    })),
}));
