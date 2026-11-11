export type PlanId = "free" | "pro" | "group";

export type CreditCostClass =
  | "generation"
  | "runtime_llm"
  | "mcp_call"
  | "api_fetch";

export interface PlanConfig {
  id: PlanId;
  label: string;
  activeAppLimit: number;
  monthlyCreditLimit: number;
  description: string;
}

/**
 * Single source of truth for plan limits and credit weights (no hardcoded vendor prices).
 * Note: `free` (3 active apps, 100 credits/month) is fixed by SIMPLE_V2_SPEC;
 * `pro` and `group` quotas are configurable placeholders until billing launch.
 */
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

export const CREDIT_COSTS_BY_CLASS: Record<CreditCostClass, number> = {
  generation: 5,
  runtime_llm: 2,
  mcp_call: 1,
  api_fetch: 1,
};

