// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  DevEntitlementProvider,
  getByokStatus,
  saveByokKey,
  deleteByokKey,
} from "./entitlementProvider";

const mockInvoke = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

describe("EntitlementProvider and BYOK Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockReset();
  });

  describe("DevEntitlementProvider", () => {
    it("calls billing-webhook with x-webhook-secret to change plan to pro", async () => {
      mockInvoke.mockResolvedValueOnce({
        data: {
          success: true,
          entitlement: {
            user_id: "user-123",
            plan: "pro",
            active_app_limit: 25,
            monthly_credit_limit: 2000,
            credits_used: 0,
            period_start: "2026-01-01T00:00:00Z",
          },
        },
        error: null,
      });

      const provider = new DevEntitlementProvider("custom-secret-123");
      const res = await provider.changePlan("user-123", "pro", {
        provider: "stripe",
        providerRef: "sub_abc",
      });

      expect(res.success).toBe(true);
      expect(res.entitlement?.plan).toBe("pro");
      expect(mockInvoke).toHaveBeenCalledWith("billing-webhook", {
        headers: { "x-webhook-secret": "custom-secret-123" },
        body: {
          event: "subscription.updated",
          user_id: "user-123",
          plan: "pro",
          provider: "stripe",
          provider_ref: "sub_abc",
        },
      });
    });

    it("cancels plan and downgrades to free", async () => {
      mockInvoke.mockResolvedValueOnce({
        data: {
          success: true,
          entitlement: {
            user_id: "user-123",
            plan: "free",
            active_app_limit: 3,
            monthly_credit_limit: 100,
          },
        },
        error: null,
      });

      const provider = new DevEntitlementProvider();
      const res = await provider.cancelPlan("user-123");

      expect(res.success).toBe(true);
      expect(res.entitlement?.plan).toBe("free");
      expect(mockInvoke).toHaveBeenCalledWith("billing-webhook", {
        headers: { "x-webhook-secret": "dev-webhook-secret" },
        body: {
          event: "subscription.canceled",
          user_id: "user-123",
        },
      });
    });

    it("grants bonus credits", async () => {
      mockInvoke.mockResolvedValueOnce({
        data: {
          success: true,
          granted_credits: 500,
        },
        error: null,
      });

      const provider = new DevEntitlementProvider();
      const res = await provider.grantCredits("user-123", 500);

      expect(res.success).toBe(true);
      expect(res.grantedCredits).toBe(500);
      expect(mockInvoke).toHaveBeenCalledWith("billing-webhook", {
        headers: { "x-webhook-secret": "dev-webhook-secret" },
        body: {
          event: "credits.grant",
          user_id: "user-123",
          credits: 500,
        },
      });
    });
  });

  describe("BYOK client methods", () => {
    it("gets BYOK status", async () => {
      mockInvoke.mockResolvedValueOnce({
        data: {
          has_byok: true,
          provider: "groq",
          preview: "gsk_••••7890",
        },
        error: null,
      });

      const status = await getByokStatus();
      expect(status.has_byok).toBe(true);
      expect(status.preview).toBe("gsk_••••7890");
      expect(mockInvoke).toHaveBeenCalledWith("manage-byok", {
        body: { op: "get" },
      });
    });

    it("saves BYOK key", async () => {
      mockInvoke.mockResolvedValueOnce({
        data: {
          success: true,
          preview: "gsk_••••7890",
        },
        error: null,
      });

      const res = await saveByokKey("gsk_1234567890", "groq");
      expect(res.success).toBe(true);
      expect(res.preview).toBe("gsk_••••7890");
      expect(mockInvoke).toHaveBeenCalledWith("manage-byok", {
        body: { op: "set", apiKey: "gsk_1234567890", provider: "groq" },
      });
    });

    it("deletes BYOK key", async () => {
      mockInvoke.mockResolvedValueOnce({
        data: {
          success: true,
          has_byok: false,
        },
        error: null,
      });

      const res = await deleteByokKey();
      expect(res.success).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith("manage-byok", {
        body: { op: "delete" },
      });
    });
  });
});

