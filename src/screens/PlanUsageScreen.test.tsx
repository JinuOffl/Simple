// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { EntitlementState } from "@/lib/credits";
import type { SavedApp } from "@/lib/zustandStore";
import type { ManifestV2 } from "@/schema/manifest.v2";

interface MaybeSingleResult {
  data: EntitlementState | null;
  error: { code: string; message: string } | null;
}

const sampleManifest: ManifestV2 = {
  schema_version: 2,
  app_id: "a1",
  name: "Notes",
  icon: "📝",
  permissions: [],
  connectors: [],
  data: { collections: [] },
  screens: [{ id: "main", title: "Main", nodes: [] }],
  actions: [],
};

const seededApps: SavedApp[] = [
  {
    id: "app-1",
    user_id: "u1",
    name: "Notes",
    icon: "📝",
    manifest: sampleManifest,
    schema_version: 2,
    status: "active",
    pinned_order: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "app-2",
    user_id: "u1",
    name: "Workout",
    icon: "🏋️",
    manifest: sampleManifest,
    schema_version: 2,
    status: "active",
    pinned_order: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "app-3",
    user_id: "u1",
    name: "Budget",
    icon: "💸",
    manifest: sampleManifest,
    schema_version: 2,
    status: "active",
    pinned_order: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "app-4",
    user_id: "u1",
    name: "Quiz",
    icon: "🎯",
    manifest: sampleManifest,
    schema_version: 2,
    status: "sleeping",
    pinned_order: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
];

const { mockFrom, mockMaybeSingle, mockOrderFinal } = vi.hoisted(() => {
  const mockMaybeSingle = vi.fn<() => Promise<MaybeSingleResult>>().mockResolvedValue({
    data: null,
    error: { code: "42P01", message: "not migrated" },
  });
  const mockOrderFinal = vi.fn<() => Promise<{ data: SavedApp[]; error: null }>>().mockResolvedValue({
    data: [],
    error: null,
  });
  const mockLimit = vi.fn<() => Promise<{ data: unknown[]; error: null }>>().mockResolvedValue({
    data: [],
    error: null,
  });

  const mockFrom = vi.fn((table: string) => {
    if (table === "apps") {
      let orderCount = 0;
      const appsChain = {
        select: vi.fn().mockReturnThis(),
        order: vi.fn(() => {
          orderCount += 1;
          return orderCount >= 2 ? mockOrderFinal() : appsChain;
        }),
        update: vi.fn(() => ({
          eq: vi.fn<() => Promise<{ error: null }>>().mockResolvedValue({ error: null }),
        })),
      };
      return appsChain;
    }

    const otherChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: mockLimit,
      maybeSingle: mockMaybeSingle,
    };
    return otherChain;
  });

  return { mockFrom, mockMaybeSingle, mockOrderFinal };
});

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: mockFrom,
    auth: {
      signOut: vi.fn<() => Promise<{ error: null }>>().mockResolvedValue({ error: null }),
    },
  },
}));

import { PlanUsageScreen } from "./PlanUsageScreen";
import { useAppStore } from "@/lib/zustandStore";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  useAppStore.setState({
    user: { id: "u1", email: "test@example.com" } as never,
    apps: seededApps,
    entitlement: {
      user_id: "u1",
      plan: "free",
      active_app_limit: 3,
      monthly_credit_limit: 100,
      credits_used: 12,
      period_start: "2026-01-01T00:00:00.000Z",
    },
    usageLedger: [],
    lastLimitError: null,
  });
  mockOrderFinal.mockResolvedValue({ data: seededApps, error: null });
  mockMaybeSingle.mockResolvedValue({
    data: {
      user_id: "u1",
      plan: "free",
      active_app_limit: 3,
      monthly_credit_limit: 100,
      credits_used: 12,
      period_start: "2026-01-01T00:00:00.000Z",
    },
    error: null,
  });
});

describe("PlanUsageScreen", () => {
  it("renders current plan quota, remaining credits, and sleeping apps without self-upgrade controls", async () => {
    render(
      <MemoryRouter>
        <PlanUsageScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockMaybeSingle).toHaveBeenCalled();
      expect(mockOrderFinal).toHaveBeenCalled();
    });

    expect(screen.getByText("3 / 3")).toBeTruthy();
    expect(screen.getByText(/88 left/i)).toBeTruthy();
    expect(screen.getByText(/1 sleeping app/i)).toBeTruthy();
    expect(screen.getByText("Quiz")).toBeTruthy();
    expect(screen.getByText("server-verified")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /upgrade/i })).toBeNull();
  });

  it("shows limit error notice when clicking Wake at 3/3 active limit", async () => {
    render(
      <MemoryRouter>
        <PlanUsageScreen />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockMaybeSingle).toHaveBeenCalled();
      expect(mockOrderFinal).toHaveBeenCalled();
    });

    const wakeBtn = screen.getByRole("button", { name: "Wake" });
    fireEvent.click(wakeBtn);

    expect(await screen.findByText(/Active app limit reached/i)).toBeTruthy();
  });
});
