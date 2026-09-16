export class BudgetExceededError extends Error {
  scope: "daily" | "monthly";
  constructor(scope: "daily" | "monthly", message?: string) {
    super(message || (scope === "daily" ? "Presupuesto diario de SERP agotado." : "Presupuesto mensual de SERP agotado."));
    this.scope = scope;
    this.name = "BudgetExceededError";
  }
}

export type BudgetLimits = {
  dailyUsd: number;
  monthlyUsd: number;
};

export type BudgetSpend = {
  dailyUsd: number;
  monthlyUsd: number;
};

export function parseBudgetUsd(value: string | undefined, fallback: number) {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export function defaultSerpBudgets(): BudgetLimits {
  return {
    dailyUsd: parseBudgetUsd(process.env.SEO_DATAFORSEO_DAILY_BUDGET_USD, 2),
    monthlyUsd: parseBudgetUsd(process.env.SEO_DATAFORSEO_MONTHLY_BUDGET_USD, 10),
  };
}

export function evaluateBudget(spend: BudgetSpend, limits: BudgetLimits, nextCostUsd: number) {
  if (limits.dailyUsd === 0 || spend.dailyUsd + nextCostUsd > limits.dailyUsd + 1e-9) {
    return { ok: false as const, scope: "daily" as const, remainingDaily: Math.max(0, limits.dailyUsd - spend.dailyUsd), remainingMonthly: Math.max(0, limits.monthlyUsd - spend.monthlyUsd) };
  }
  if (limits.monthlyUsd === 0 || spend.monthlyUsd + nextCostUsd > limits.monthlyUsd + 1e-9) {
    return { ok: false as const, scope: "monthly" as const, remainingDaily: Math.max(0, limits.dailyUsd - spend.dailyUsd), remainingMonthly: Math.max(0, limits.monthlyUsd - spend.monthlyUsd) };
  }
  return {
    ok: true as const,
    remainingDaily: Math.max(0, limits.dailyUsd - spend.dailyUsd - nextCostUsd),
    remainingMonthly: Math.max(0, limits.monthlyUsd - spend.monthlyUsd - nextCostUsd),
  };
}

export function assertBudget(spend: BudgetSpend, limits: BudgetLimits, nextCostUsd: number) {
  const result = evaluateBudget(spend, limits, nextCostUsd);
  if (!result.ok) throw new BudgetExceededError(result.scope);
  return result;
}
