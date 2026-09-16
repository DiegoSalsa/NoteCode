import { describe, expect, it } from "vitest";
import { BudgetExceededError, assertBudget, evaluateBudget, parseBudgetUsd } from "@/lib/seo/budget";

describe("seo serp budgets", () => {
  it("parses empty env as the provided default", () => {
    expect(parseBudgetUsd(undefined, 2)).toBe(2);
    expect(parseBudgetUsd("", 10)).toBe(10);
    expect(parseBudgetUsd("0", 2)).toBe(0);
  });

  it("blocks a call that would exceed the daily budget", () => {
    const result = evaluateBudget({ dailyUsd: 1.99, monthlyUsd: 1.99 }, { dailyUsd: 2, monthlyUsd: 10 }, 0.02);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.scope).toBe("daily");
  });

  it("blocks a call that would exceed the monthly budget", () => {
    const result = evaluateBudget({ dailyUsd: 0.1, monthlyUsd: 9.99 }, { dailyUsd: 2, monthlyUsd: 10 }, 0.02);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.scope).toBe("monthly");
  });

  it("treats a zero budget as fully blocked", () => {
    const result = evaluateBudget({ dailyUsd: 0, monthlyUsd: 0 }, { dailyUsd: 0, monthlyUsd: 10 }, 0.002);
    expect(result.ok).toBe(false);
  });

  it("throws BudgetExceededError when asserting", () => {
    expect(() => assertBudget({ dailyUsd: 2, monthlyUsd: 2 }, { dailyUsd: 2, monthlyUsd: 10 }, 0.002)).toThrow(BudgetExceededError);
  });
});
