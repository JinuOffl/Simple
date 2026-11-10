import { create } from "zustand";
import type { Manifest } from "@/schema/manifest.schema";
import { supabase } from "./supabaseClient";
import type { User, Session } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SavedApp {
  id: string;
  user_id: string;
  name: string;
  icon: string;
  manifest: Manifest;
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
  currentManifest: Manifest | null;
  conversationContext: Array<{ role: "user" | "assistant"; content: string }>;
  isGenerating: boolean;
  generationError: string | null;
  editingAppId: string | null; // set when editing an existing app

  setManifest: (manifest: Manifest | null) => void;
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
  saveApp: (manifest: Manifest, existingId?: string) => Promise<SavedApp | null>;
  deleteApp: (id: string) => Promise<void>;
  setComponentLoading: (componentId: string, loading: boolean) => void;
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
      set({ apps: (data as SavedApp[]) ?? [] });
    }
    set({ loadingApps: false });
  },

  saveApp: async (manifest, existingId) => {
    const { user } = get();
    if (!user) return null;

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
      result = data as SavedApp;

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
      result = data as SavedApp;

      set((s) => ({ apps: [result!, ...s.apps] }));
    }

    return result;
  },

  deleteApp: async (id) => {
    const { error } = await supabase.from("apps").delete().eq("id", id);
    if (!error) {
      set((s) => ({ apps: s.apps.filter((a) => a.id !== id) }));
    }
  },

  setComponentLoading: (componentId, loading) =>
    set((s) => ({
      componentLoadingMap: { ...s.componentLoadingMap, [componentId]: loading },
    })),
}));
