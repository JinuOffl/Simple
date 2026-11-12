import { supabase } from "./supabaseClient";
import type { PlanId } from "@/config/plans";
import type { EntitlementState } from "./credits";

export interface ByokStatus {
  has_byok: boolean;
  provider?: string;
  preview?: string;
  updated_at?: string;
}

export interface EntitlementProvider {
  changePlan(
    userId: string,
    plan: PlanId,
    options?: { provider?: string; providerRef?: string; webhookSecret?: string }
  ): Promise<{ success: boolean; entitlement?: EntitlementState; error?: string }>;
  cancelPlan(
    userId: string,
    options?: { webhookSecret?: string }
  ): Promise<{ success: boolean; entitlement?: EntitlementState; error?: string }>;
  grantCredits(
    userId: string,
    credits: number,
    options?: { webhookSecret?: string }
  ): Promise<{ success: boolean; grantedCredits?: number; error?: string }>;
}

/**
 * DevEntitlementProvider calls the server-side billing-webhook Edge Function
 * with the required secret header.
 */
export class DevEntitlementProvider implements EntitlementProvider {
  private webhookSecret: string;

  constructor(webhookSecret: string = "dev-webhook-secret") {
    this.webhookSecret = webhookSecret;
  }

  async changePlan(
    userId: string,
    plan: PlanId,
    options: { provider?: string; providerRef?: string; webhookSecret?: string } = {}
  ) {
    const secret = options.webhookSecret ?? this.webhookSecret;
    try {
      const { data, error } = await supabase.functions.invoke("billing-webhook", {
        headers: { "x-webhook-secret": secret },
        body: {
          event: "subscription.updated",
          user_id: userId,
          plan,
          provider: options.provider ?? "dev",
          provider_ref: options.providerRef,
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, entitlement: data?.entitlement as EntitlementState };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async cancelPlan(
    userId: string,
    options: { webhookSecret?: string } = {}
  ) {
    const secret = options.webhookSecret ?? this.webhookSecret;
    try {
      const { data, error } = await supabase.functions.invoke("billing-webhook", {
        headers: { "x-webhook-secret": secret },
        body: {
          event: "subscription.canceled",
          user_id: userId,
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, entitlement: data?.entitlement as EntitlementState };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async grantCredits(
    userId: string,
    credits: number,
    options: { webhookSecret?: string } = {}
  ) {
    const secret = options.webhookSecret ?? this.webhookSecret;
    try {
      const { data, error } = await supabase.functions.invoke("billing-webhook", {
        headers: { "x-webhook-secret": secret },
        body: {
          event: "credits.grant",
          user_id: userId,
          credits,
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, grantedCredits: data?.granted_credits as number };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

/**
 * Fetch current BYOK status for the logged-in user.
 * Plaintext keys are never returned.
 */
export async function getByokStatus(): Promise<ByokStatus> {
  try {
    if (!supabase?.functions?.invoke) return { has_byok: false };
    const { data, error } = await supabase.functions.invoke("manage-byok", {
      body: { op: "get" },
    });
    if (error || !data) return { has_byok: false };
    return data as ByokStatus;
  } catch {
    return { has_byok: false };
  }
}

/**
 * Save user's BYOK key encrypted server-side.
 */
export async function saveByokKey(
  apiKey: string,
  provider = "groq"
): Promise<{ success: boolean; preview?: string; error?: string }> {
  try {
    if (!supabase?.functions?.invoke) return { success: false, error: "Unavailable" };
    const { data, error } = await supabase.functions.invoke("manage-byok", {
      body: { op: "set", apiKey, provider },
    });
    if (error || !data?.success) {
      return { success: false, error: error?.message ?? "Failed to save key" };
    }
    return { success: true, preview: data.preview as string };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Remove user's BYOK key.
 */
export async function deleteByokKey(): Promise<{ success: boolean; error?: string }> {
  try {
    if (!supabase?.functions?.invoke) return { success: false, error: "Unavailable" };
    const { data, error } = await supabase.functions.invoke("manage-byok", {
      body: { op: "delete" },
    });
    if (error || !data?.success) {
      return { success: false, error: error?.message ?? "Failed to delete key" };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
