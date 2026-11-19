import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Manifest } from "@/schema/manifest.v1";
import { ManifestV2Schema, type ManifestV2 } from "@/schema/manifest.v2";

const { mockEq, mockSelect, mockUpdate, mockDelete, mockFrom } = vi.hoisted(() => {
  const mockSelect = vi
    .fn<() => Promise<{ data: Array<{ id: string }>; error: null }>>()
    .mockResolvedValue({ data: [{ id: "app-1" }], error: null });
  const mockEq = vi
    .fn<(column: string, value: string) => { select: typeof mockSelect }>()
    .mockReturnValue({ select: mockSelect });
  const mockUpdate = vi.fn<(values: Record<string, unknown>) => { eq: typeof mockEq }>(() => ({
    eq: mockEq,
  }));
  const mockDelete = vi.fn<() => { eq: typeof mockEq }>(() => ({ eq: mockEq }));
  const mockFrom = vi.fn<
    (table: string) => { update: typeof mockUpdate; delete: typeof mockDelete }
  >(() => ({
    update: mockUpdate,
    delete: mockDelete,
  }));
  return { mockEq, mockSelect, mockUpdate, mockDelete, mockFrom };
});

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: mockFrom,
    auth: {
      signOut: vi.fn<() => Promise<{ error: null }>>().mockResolvedValue({ error: null }),
    },
  },
}));

import { useAppStore, exportApp, type SavedApp } from "./zustandStore";

const sampleV1Manifest: Manifest = {
  app_id: "app-v1",
  name: "Outfit Picker",
  icon: "👗",
  permissions: ["camera"],
  components: [
    { id: "c1", type: "image_capture", props: { label: "Take a photo" }, on_click: "a1" },
    { id: "c2", type: "text", props: { content: "Recommendation" } },
  ],
  actions: [
    {
      id: "a1",
      kind: "llm_call",
      prompt_template: "Suggest an outfit",
      render_result_into: "c2",
    },
  ],
};

const sampleV2Manifest: ManifestV2 = {
  schema_version: 2,
  app_id: "app-v2",
  name: "Task Tracker",
  icon: "✅",
  permissions: [],
  connectors: [],
  data: { collections: [] },
  screens: [
    {
      id: "main",
      title: "Main",
      nodes: [{ id: "n1", type: "text", props: { content: "All tasks" } }],
    },
  ],
  actions: [],
};

const makeSavedApp = (overrides: Partial<SavedApp> = {}): SavedApp => ({
  id: "app-1",
  user_id: "user-1",
  name: "Outfit Picker",
  icon: "👗",
  manifest: sampleV1Manifest,
  schema_version: 1,
  status: "active",
  pinned_order: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

interface ExportedEnvelope {
  exported_at: string;
  schema_version: number;
  app: {
    id: string;
    name: string;
    icon: string;
    status: "active" | "sleeping";
    manifest: ManifestV2;
  };
}

describe("useAppStore — sleepApp, wakeApp, exportApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockResolvedValue({ data: [{ id: "app-1" }], error: null });
    mockEq.mockReturnValue({ select: mockSelect });
    useAppStore.setState({
      apps: [
        makeSavedApp({ id: "app-1", status: "active" }),
        makeSavedApp({ id: "app-2", name: "Task Tracker", icon: "✅", manifest: sampleV2Manifest, schema_version: 2, status: "active" }),
      ],
    });
  });

  it("sleepApp updates status to 'sleeping' via supabase.from('apps').update(...).eq(...) and NEVER calls delete()", async () => {
    await useAppStore.getState().sleepApp("app-1");

    expect(mockFrom).toHaveBeenCalledWith("apps");
    expect(mockUpdate).toHaveBeenCalledWith({ status: "sleeping" });
    expect(mockEq).toHaveBeenCalledWith("id", "app-1");
    expect(mockDelete).not.toHaveBeenCalled();

    const apps = useAppStore.getState().apps;
    expect(apps.find((a) => a.id === "app-1")?.status).toBe("sleeping");
    expect(apps.find((a) => a.id === "app-2")?.status).toBe("active");
    expect(apps).toHaveLength(2);
  });

  it("wakeApp updates status to 'active' via supabase.from('apps').update(...).eq(...) and updates local state", async () => {
    useAppStore.setState({
      apps: [makeSavedApp({ id: "app-1", status: "sleeping" })],
    });

    await useAppStore.getState().wakeApp("app-1");

    expect(mockFrom).toHaveBeenCalledWith("apps");
    expect(mockUpdate).toHaveBeenCalledWith({ status: "active" });
    expect(mockEq).toHaveBeenCalledWith("id", "app-1");
    expect(mockDelete).not.toHaveBeenCalled();

    expect(useAppStore.getState().apps.find((a) => a.id === "app-1")?.status).toBe("active");
  });

  it("wakeApp blocks waking past active_app_limit without calling delete or Supabase update", async () => {
    useAppStore.setState({
      entitlement: {
        user_id: "user-1",
        plan: "free",
        active_app_limit: 3,
        monthly_credit_limit: 100,
        credits_used: 0,
        period_start: "2026-01-01T00:00:00.000Z",
      },
      apps: [
        makeSavedApp({ id: "a1", status: "active" }),
        makeSavedApp({ id: "a2", status: "active" }),
        makeSavedApp({ id: "a3", status: "active" }),
        makeSavedApp({ id: "a4", status: "sleeping" }),
      ],
    });

    const res = await useAppStore.getState().wakeApp("a4");

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/3\/3/);
    expect(useAppStore.getState().lastLimitError).toMatch(/3\/3/);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(useAppStore.getState().apps.find((a) => a.id === "a4")?.status).toBe("sleeping");
  });

  it("exportApp produces valid v2 JSON for a v1 manifest (auto-migrated)", () => {
    const v1App = makeSavedApp({ id: "app-1", manifest: sampleV1Manifest, status: "active" });
    const json = exportApp(v1App);
    const parsed = JSON.parse(json) as ExportedEnvelope;

    expect(parsed.schema_version).toBe(2);
    expect(typeof parsed.exported_at).toBe("string");
    expect(parsed.app.id).toBe("app-1");
    expect(parsed.app.status).toBe("active");
    expect(parsed.app.manifest.schema_version).toBe(2);
    expect(parsed.app.manifest.screens[0]?.id).toBe("main");

    const schemaCheck = ManifestV2Schema.safeParse(parsed.app.manifest);
    expect(schemaCheck.success).toBe(true);
  });

  it("exportApp produces valid v2 JSON for a v2 manifest including when sleeping", () => {
    const sleepingV2App = makeSavedApp({
      id: "app-2",
      name: "Task Tracker",
      icon: "✅",
      manifest: sampleV2Manifest,
      schema_version: 2,
      status: "sleeping",
    });

    const json = useAppStore.getState().exportApp(sleepingV2App);
    const parsed = JSON.parse(json) as ExportedEnvelope;

    expect(parsed.schema_version).toBe(2);
    expect(parsed.app.id).toBe("app-2");
    expect(parsed.app.status).toBe("sleeping");
    expect(parsed.app.manifest).toEqual(sampleV2Manifest);

    const schemaCheck = ManifestV2Schema.safeParse(parsed.app.manifest);
    expect(schemaCheck.success).toBe(true);
  });
});
