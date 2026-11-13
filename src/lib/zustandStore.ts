import { create } from "zustand";
import type { User, Session } from "@supabase/supabase-js";
import type { Manifest } from "@/schema/manifest.v1";
import type { ManifestV2 } from "@/schema/manifest.v2";
import { migrateV1toV2, needsMigration } from "@/schema/migrator";
import {
  createDefaultEntitlement,
  selectAppsToSleepOnLimit,
  type EntitlementState,
  type UsageLedgerEntry,
} from "./credits";
import { PLANS } from "@/config/plans";
import { supabase } from "./supabaseClient";
import {
  clearLocalGuestSession,
  isGuestUser,
  loginAsGuest,
} from "./guestAuth";

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
  signInAsGuest: () => Promise<{ ok: boolean; error?: string }>;
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
  entitlement: EntitlementState | null;
  usageLedger: UsageLedgerEntry[];
  loadingEntitlement: boolean;
  entitlementSyncStatus: "synced" | "fallback";
  lastLimitError: string | null;

  fetchApps: () => Promise<void>;
  fetchEntitlementAndUsage: () => Promise<void>;
  clearLimitError: () => void;
  saveApp: (manifest: Manifest | ManifestV2, existingId?: string) => Promise<SavedApp | null>;
  sleepApp: (id: string) => Promise<void>;
  wakeApp: (id: string) => Promise<{ ok: boolean; error?: string }>;
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

  signInAsGuest: async () => {
    try {
      const { session } = await loginAsGuest();
      set({ session, user: session.user });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Guest sign-in failed",
      };
    }
  },

  signOut: async () => {
    clearLocalGuestSession();
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    set({
      session: null,
      user: null,
      apps: [],
      entitlement: null,
      usageLedger: [],
      entitlementSyncStatus: "synced",
      lastLimitError: null,
    });
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
  entitlement: null,
  usageLedger: [],
  loadingEntitlement: false,
  entitlementSyncStatus: "synced",
  lastLimitError: null,

  clearLimitError: () => set({ lastLimitError: null }),

  fetchApps: async () => {
    set({ loadingApps: true });
    const { user } = get();
    if (!user) {
      set({ apps: [], loadingApps: false });
      return;
    }

    if (user.id.startsWith("guest-")) {
      try {
        const stored = localStorage.getItem(`simple_guest_apps_${user.id}`);
        const apps: SavedApp[] = stored ? JSON.parse(stored) : [];
        set({ apps: apps.map(normalizeSavedApp), loadingApps: false });
      } catch {
        set({ apps: [], loadingApps: false });
      }
      return;
    }

    const { data, error } = await supabase
      .from("apps")
      .select("*")
      .order("pinned_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("fetchApps error:", error);
      if (isGuestUser(user)) {
        try {
          const stored = localStorage.getItem(`simple_guest_apps_${user.id}`);
          if (stored) {
            const apps: SavedApp[] = JSON.parse(stored);
            set({ apps: apps.map(normalizeSavedApp), loadingApps: false });
            return;
          }
        } catch {
          // ignore
        }
      }
    } else {
      set({ apps: ((data as SavedApp[] | null) ?? []).map(normalizeSavedApp) });
    }
    set({ loadingApps: false });
  },

  fetchEntitlementAndUsage: async () => {
    const { user } = get();
    if (!user) {
      set({
        entitlement: createDefaultEntitlement(),
        usageLedger: [],
        loadingEntitlement: false,
        entitlementSyncStatus: "synced",
      });
      return;
    }

    if (user.id.startsWith("guest-")) {
      set({
        entitlement: createDefaultEntitlement(user.id),
        usageLedger: [],
        loadingEntitlement: false,
        entitlementSyncStatus: "synced",
      });
      return;
    }

    set({ loadingEntitlement: true });
    const entRes = await supabase
      .from("entitlements")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (entRes.error) {
      // Migration 002 not yet applied on remote DB -> use non-fatal Free defaults
      console.warn("[Simple] Entitlements table unavailable, using free fallback:", entRes.error.message);
      set({
        entitlement: createDefaultEntitlement(user.id),
        usageLedger: [],
        loadingEntitlement: false,
        entitlementSyncStatus: "fallback",
      });
      return;
    }

    const ledgerRes = await supabase
      .from("usage_ledger")
      .select("id, user_id, app_id, action_kind, credit_cost_class, credits_charged, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    set({
      entitlement: (entRes.data as EntitlementState | null) ?? createDefaultEntitlement(user.id),
      usageLedger: (ledgerRes.data as UsageLedgerEntry[] | null) ?? [],
      loadingEntitlement: false,
      entitlementSyncStatus: "synced",
    });
  },

  saveApp: async (manifest, existingId) => {
    const { user, entitlement } = get();
    if (!user) return null;

    const schemaVersion =
      "schema_version" in manifest && manifest.schema_version === 2 ? 2 : 1;

    // Handle local guest storage path
    if (user.id.startsWith("guest-")) {
      const existingApps = get().apps;
      const now = new Date().toISOString();
      let result: SavedApp;

      if (existingId) {
        const existing = existingApps.find((a) => a.id === existingId);
        result = {
          ...(existing ?? {}),
          id: existingId,
          user_id: user.id,
          name: manifest.name,
          icon: manifest.icon,
          manifest,
          schema_version: schemaVersion,
          status: existing?.status ?? "active",
          pinned_order: existing?.pinned_order ?? null,
          created_at: existing?.created_at ?? now,
          updated_at: now,
        };
        const updated = existingApps.map((a) => (a.id === existingId ? result : a));
        try {
          localStorage.setItem(`simple_guest_apps_${user.id}`, JSON.stringify(updated));
        } catch (e) {
          console.warn("Failed to persist guest app:", e);
        }
        set({ apps: updated });
      } else {
        result = {
          id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `app-${Date.now()}`,
          user_id: user.id,
          name: manifest.name,
          icon: manifest.icon,
          manifest,
          schema_version: schemaVersion,
          status: "active",
          pinned_order: null,
          created_at: now,
          updated_at: now,
        };
        const nextApps = [result, ...existingApps];
        const limit = entitlement?.active_app_limit ?? PLANS.free.activeAppLimit;
        const toSleepIds = new Set(selectAppsToSleepOnLimit(nextApps, limit));
        const processed = nextApps.map((a) =>
          toSleepIds.has(a.id) ? { ...a, status: "sleeping" as const } : a
        );
        try {
          localStorage.setItem(`simple_guest_apps_${user.id}`, JSON.stringify(processed));
        } catch (e) {
          console.warn("Failed to persist guest app:", e);
        }
        set({ apps: processed });
      }
      return result;
    }

    const basePayload = {
      user_id: user.id,
      name: manifest.name,
      icon: manifest.icon,
      manifest: manifest as unknown as Record<string, unknown>,
    };

    const v2Payload = {
      ...basePayload,
      schema_version: schemaVersion,
    };

    const isMissingColumnError = (err: { code?: string; message?: string } | null): boolean =>
      Boolean(
        err &&
          (err.code === "42703" ||
            err.code === "PGRST204" ||
            err.message?.includes("schema_version"))
      );

    let result: SavedApp | null = null;

    if (existingId) {
      let { data, error } = await supabase
        .from("apps")
        .update({ ...v2Payload, updated_at: new Date().toISOString() })
        .eq("id", existingId)
        .select()
        .single();

      if (isMissingColumnError(error)) {
        const retry = await supabase
          .from("apps")
          .update({ ...basePayload, updated_at: new Date().toISOString() })
          .eq("id", existingId)
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) { console.error("saveApp update error:", error); return null; }
      result = normalizeSavedApp(data as SavedApp);

      set((s) => ({
        apps: s.apps.map((a) => (a.id === existingId ? result! : a)),
      }));
    } else {
      let { data, error } = await supabase
        .from("apps")
        .insert(v2Payload)
        .select()
        .single();

      if (isMissingColumnError(error)) {
        const retry = await supabase
          .from("apps")
          .insert(basePayload)
          .select()
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) { console.error("saveApp insert error:", error); return null; }
      result = normalizeSavedApp(data as SavedApp);

      set((s) => {
        const nextApps = [result!, ...s.apps];
        const limit = entitlement?.active_app_limit ?? PLANS.free.activeAppLimit;
        const toSleepIds = new Set(selectAppsToSleepOnLimit(nextApps, limit));
        return {
          apps: nextApps.map((a) =>
            toSleepIds.has(a.id) ? { ...a, status: "sleeping" as const } : a
          ),
        };
      });
    }

    return result;
  },

  sleepApp: async (id) => {
    const { user } = get();
    if (user?.id.startsWith("guest-")) {
      set((s) => {
        const next = s.apps.map((a) => (a.id === id ? { ...a, status: "sleeping" as const } : a));
        try {
          localStorage.setItem(`simple_guest_apps_${user.id}`, JSON.stringify(next));
        } catch (e) {
          console.warn("Failed to persist guest apps sleep:", e);
        }
        return { lastLimitError: null, apps: next };
      });
      return;
    }

    const { error } = await supabase
      .from("apps")
      .update({ status: "sleeping" })
      .eq("id", id);

    if (error) {
      console.error("sleepApp error:", error);
      return;
    }

    set((s) => ({
      lastLimitError: null,
      apps: s.apps.map((a) => (a.id === id ? { ...a, status: "sleeping" } : a)),
    }));
  },

  wakeApp: async (id) => {
    const { apps, entitlement, user } = get();
    const activeLimit = entitlement?.active_app_limit ?? PLANS.free.activeAppLimit;
    const planLabel = entitlement?.plan ?? "free";
    const otherActiveCount = apps.filter(
      (a) => a.id !== id && (a.status ?? "active") === "active"
    ).length;

    if (otherActiveCount >= activeLimit) {
      const msg = `Active app limit reached (${activeLimit}/${activeLimit} on ${planLabel} plan). Put another app to sleep or export it as JSON first.`;
      set({ lastLimitError: msg });
      return { ok: false, error: msg };
    }

    if (user?.id.startsWith("guest-")) {
      set((s) => {
        const next = s.apps.map((a) => (a.id === id ? { ...a, status: "active" as const } : a));
        try {
          localStorage.setItem(`simple_guest_apps_${user.id}`, JSON.stringify(next));
        } catch (e) {
          console.warn("Failed to persist guest apps wake:", e);
        }
        return { lastLimitError: null, apps: next };
      });
      return { ok: true };
    }

    const { error } = await supabase
      .from("apps")
      .update({ status: "active" })
      .eq("id", id);

    if (error) {
      const msg = error.message.includes("ACTIVE_APP_LIMIT_REACHED")
        ? `Active app limit reached (${activeLimit}/${activeLimit}). Put another app to sleep first.`
        : error.message;
      console.error("wakeApp error:", error);
      set({ lastLimitError: msg });
      return { ok: false, error: msg };
    }

    set((s) => ({
      lastLimitError: null,
      apps: s.apps.map((a) => (a.id === id ? { ...a, status: "active" } : a)),
    }));
    return { ok: true };
  },

  exportApp,

  setComponentLoading: (componentId, loading) =>
    set((s) => ({
      componentLoadingMap: { ...s.componentLoadingMap, [componentId]: loading },
    })),
}));
