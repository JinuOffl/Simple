// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { runAction } from "./actionRunner";
import { useAppStore } from "@/lib/zustandStore";
import type { ManifestV2Action } from "@/schema/manifest.v2";

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "collection_records") {
        return {
          insert: (...args: unknown[]) => {
            mockInsert(...args);
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: "rec-test-123" },
                    error: null,
                  }),
              }),
            };
          },
          update: (...args: unknown[]) => {
            mockUpdate(...args);
            return {
              eq: (...eqArgs1: unknown[]) => {
                mockEq(...eqArgs1);
                return {
                  eq: (...eqArgs2: unknown[]) => {
                    mockEq(...eqArgs2);
                    return Promise.resolve({ error: null });
                  },
                };
              },
            };
          },
        };
      }
      return {};
    },
  },
}));

describe("Multiplayer ActionRunner — record_insert and record_update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      user: {
        id: "test-user-1111",
        email: "test@example.com",
        app_metadata: {},
        user_metadata: {},
        aud: "authenticated",
        created_at: "2026-01-01T00:00:00Z",
      },
    });
  });

  it("executes record_insert, saves data to collection_records, and dispatches simple:collection_records_changed", async () => {
    const action: ManifestV2Action = {
      id: "save_item",
      kind: "record_insert",
      collection: "inventory",
      input_from: ["item_name", "quantity"],
      render_result_into: "status_msg",
    };

    const appData = {
      item_name: "Widget Pro",
      quantity: 42,
    };

    const onDataChange = vi.fn();
    const eventPromise = new Promise<CustomEvent>((resolve) => {
      window.addEventListener(
        "simple:collection_records_changed",
        ((e: CustomEvent) => resolve(e)) as EventListener,
        { once: true }
      );
    });

    await runAction({
      action,
      appData,
      appId: "app-test-999",
      onDataChange,
    });

    expect(mockInsert).toHaveBeenCalledWith({
      app_id: "app-test-999",
      collection_name: "inventory",
      owner_id: "test-user-1111",
      is_shared: true,
      data: {
        item_name: "Widget Pro",
        quantity: 42,
      },
    });

    expect(onDataChange).toHaveBeenCalledWith(
      "status_msg",
      "Saved to inventory"
    );

    const emittedEvent = await eventPromise;
    expect(emittedEvent.detail).toEqual({
      app_id: "app-test-999",
      collection: "inventory",
      record_id: "rec-test-123",
    });
  });

  it("executes record_update with target record ID and updates collection_records", async () => {
    const action: ManifestV2Action = {
      id: "update_item",
      kind: "record_update",
      collection: "inventory",
      input_from: ["quantity"],
    };

    const appData = {
      inventory_id: "rec-test-123",
      quantity: 99,
    };

    const eventPromise = new Promise<CustomEvent>((resolve) => {
      window.addEventListener(
        "simple:collection_records_changed",
        ((e: CustomEvent) => resolve(e)) as EventListener,
        { once: true }
      );
    });

    await runAction({
      action,
      appData,
      appId: "app-test-999",
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { quantity: 99 },
      })
    );
    expect(mockEq).toHaveBeenCalledWith("id", "rec-test-123");
    expect(mockEq).toHaveBeenCalledWith("app_id", "app-test-999");

    const emittedEvent = await eventPromise;
    expect(emittedEvent.detail).toEqual({
      app_id: "app-test-999",
      collection: "inventory",
      record_id: "rec-test-123",
    });
  });
});
