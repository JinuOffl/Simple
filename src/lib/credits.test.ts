import { describe, it, expect } from "vitest";
import {
  createDefaultEntitlement,
  getCreditCost,
  getPlanConfig,
  getRemainingCredits,
  hasEnoughCredits,
  isActiveAppLimitReached,
  selectAppsToSleepOnLimit,
} from "./credits";

describe("credits & plan limit helpers", () => {
  it("creates free entitlement matching spec defaults (3 apps, 100 credits)", () => {
    const ent = createDefaultEntitlement("user-1");
    expect(ent.plan).toBe("free");
    expect(ent.active_app_limit).toBe(3);
    expect(ent.monthly_credit_limit).toBe(100);
    expect(getRemainingCredits(ent)).toBe(100);
  });

  it("computes remaining credits and sufficient-balance checks by cost class", () => {
    const ent = { ...createDefaultEntitlement("user-1"), credits_used: 96 };
    expect(getRemainingCredits(ent)).toBe(4);
    expect(hasEnoughCredits(ent, "generation")).toBe(false); // costs 5
    expect(hasEnoughCredits(ent, "runtime_llm")).toBe(true); // costs 2
    expect(hasEnoughCredits(ent, "mcp_call")).toBe(true); // costs 1
    expect(getCreditCost("generation")).toBe(5);
  });

  it("resolves plan configs cleanly with free fallback", () => {
    expect(getPlanConfig("free").activeAppLimit).toBe(3);
    expect(getPlanConfig("pro").monthlyCreditLimit).toBeGreaterThan(100);
    expect(getPlanConfig("unknown").id).toBe("free");
    expect(isActiveAppLimitReached(3, createDefaultEntitlement())).toBe(true);
    expect(isActiveAppLimitReached(2, createDefaultEntitlement())).toBe(false);
  });

  it("selects excess unpinned oldest apps to sleep without touching pinned/newest apps", () => {
    const apps = [
      {
        id: "old-pinned",
        status: "active" as const,
        pinned_order: 1,
        updated_at: "2026-01-01T00:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "old-unpinned",
        status: "active" as const,
        pinned_order: null,
        updated_at: "2026-01-02T00:00:00Z",
        created_at: "2026-01-02T00:00:00Z",
      },
      {
        id: "mid-unpinned",
        status: "active" as const,
        pinned_order: null,
        updated_at: "2026-01-03T00:00:00Z",
        created_at: "2026-01-03T00:00:00Z",
      },
      {
        id: "newest-unpinned",
        status: "active" as const,
        pinned_order: null,
        updated_at: "2026-01-04T00:00:00Z",
        created_at: "2026-01-04T00:00:00Z",
      },
    ];

    expect(selectAppsToSleepOnLimit(apps, 3)).toEqual(["old-unpinned"]);
  });
});

