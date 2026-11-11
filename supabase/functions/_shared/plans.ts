export type PlanId = "free" | "pro" | "group";
export type CreditCostClass = "generation" | "runtime_llm" | "mcp_call" | "api_fetch";

export const CREDIT_COSTS_BY_CLASS: Record<CreditCostClass, number> = {
  generation: 5,
  runtime_llm: 2,
  mcp_call: 1,
  api_fetch: 1,
};

export const PLAN_LIMITS: Record<
  PlanId,
  { activeAppLimit: number; monthlyCreditLimit: number }
> = {
  free: { activeAppLimit: 3, monthlyCreditLimit: 100 },
  pro: { activeAppLimit: 25, monthlyCreditLimit: 2000 },
  group: { activeAppLimit: 50, monthlyCreditLimit: 5000 },
};

export function getCreditCostForClass(costClass: CreditCostClass): number {
  return CREDIT_COSTS_BY_CLASS[costClass];
}

