import {
  CREDIT_COSTS_BY_CLASS,
  PLANS,
  type CreditCostClass,
  type PlanConfig,
  type PlanId,
} from "@/config/plans";

export interface EntitlementState {
  user_id?: string;
  plan: PlanId;
  active_app_limit: number;
  monthly_credit_limit: number;
  credits_used: number;
  period_start: string;
  updated_at?: string;
}

export interface UsageLedgerEntry {
  id: string;
  user_id?: string;
  app_id: string | null;
  action_kind: string;
  credit_cost_class: string;
  credits_charged: number;
  created_at: string;
}

export function createDefaultEntitlement(userId?: string): EntitlementState {
  const free = PLANS.free;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    user_id: userId,
    plan: "free",
    active_app_limit: free.activeAppLimit,
    monthly_credit_limit: free.monthlyCreditLimit,
    credits_used: 0,
    period_start: monthStart.toISOString(),
  };
}

export function getPlanConfig(plan: PlanId | string | undefined): PlanConfig {
  if (plan === "pro" || plan === "group" || plan === "free") {
    return PLANS[plan];
  }
  return PLANS.free;
}

export function getCreditCost(costClass: CreditCostClass): number {
  return CREDIT_COSTS_BY_CLASS[costClass];
}

export function getRemainingCredits(entitlement: EntitlementState): number {
  return Math.max(0, entitlement.monthly_credit_limit - entitlement.credits_used);
}

export function hasEnoughCredits(
  entitlement: EntitlementState,
  costClass: CreditCostClass
): boolean {
  return getRemainingCredits(entitlement) >= getCreditCost(costClass);
}

export function isActiveAppLimitReached(
  activeCount: number,
  entitlement: EntitlementState
): boolean {
  return activeCount >= entitlement.active_app_limit;
}

/**
 * Pure helper mirroring DB `enforce_active_limit`: determines which excess active
 * apps would transition to `sleeping` while preserving pinned & newest apps.
 * Never deletes any app.
 */
export function selectAppsToSleepOnLimit<
  T extends {
    id: string;
    status?: "active" | "sleeping";
    pinned_order: number | null;
    updated_at: string;
    created_at: string;
  },
>(apps: T[], activeAppLimit: number): string[] {
  const active = apps.filter((a) => (a.status ?? "active") === "active");
  if (active.length <= activeAppLimit) return [];

  const ranked = [...active].sort((a, b) => {
    const pinA = a.pinned_order ?? Number.MAX_SAFE_INTEGER;
    const pinB = b.pinned_order ?? Number.MAX_SAFE_INTEGER;
    if (pinA !== pinB) return pinA - pinB;
    const updCmp = b.updated_at.localeCompare(a.updated_at);
    if (updCmp !== 0) return updCmp;
    const crtCmp = b.created_at.localeCompare(a.created_at);
    if (crtCmp !== 0) return crtCmp;
    return a.id.localeCompare(b.id);
  });

  return ranked.slice(activeAppLimit).map((a) => a.id);
}

