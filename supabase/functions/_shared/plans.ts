export type PlanId = "free" | "pro" | "group";
export type CreditCostClass = "generation" | "runtime_llm" | "mcp_call" | "api_fetch";

export interface PlanConfig {
  id: PlanId;
  label: string;
  activeAppLimit: number;
  monthlyCreditLimit: number;
  description: string;
}

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    label: "Free",
    activeAppLimit: 3,
    monthlyCreditLimit: 100,
    description: "3 active apps (unlimited sleeping/exported), 100 credits/month",
  },
  pro: {
    id: "pro",
    label: "Pro",
    activeAppLimit: 25,
    monthlyCreditLimit: 2000,
    description: "25 active apps, 2,000 credits/month",
  },
  group: {
    id: "group",
    label: "Group",
    activeAppLimit: 50,
    monthlyCreditLimit: 5000,
    description: "50 active apps, 5,000 credits/month for shared tools",
  },
};

export const PLAN_LIMITS: Record<
  PlanId,
  { activeAppLimit: number; monthlyCreditLimit: number }
> = {
  free: {
    activeAppLimit: PLANS.free.activeAppLimit,
    monthlyCreditLimit: PLANS.free.monthlyCreditLimit,
  },
  pro: {
    activeAppLimit: PLANS.pro.activeAppLimit,
    monthlyCreditLimit: PLANS.pro.monthlyCreditLimit,
  },
  group: {
    activeAppLimit: PLANS.group.activeAppLimit,
    monthlyCreditLimit: PLANS.group.monthlyCreditLimit,
  },
};

export const CREDIT_COSTS_BY_CLASS: Record<CreditCostClass, number> = {
  generation: 5,
  runtime_llm: 2,
  mcp_call: 1,
  api_fetch: 1,
};

export function getCreditCostForClass(costClass: CreditCostClass): number {
  return CREDIT_COSTS_BY_CLASS[costClass];
}
