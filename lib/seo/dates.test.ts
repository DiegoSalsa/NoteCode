import { describe, expect, it } from "vitest";
import { deltaPct, parseGoogleDate, previousPeriod, resolvePeriod, truncateDimension, weightedAverage } from "@/lib/seo/dates";
import { summarizeGsc, withDelta } from "@/lib/seo/aggregates";

describe("seo dates and metrics", () => {
  it("parses GSC and GA4 date formats", () => {
    expect(parseGoogleDate("2026-09-01").toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(parseGoogleDate("20260901").toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("builds a previous period of the same length", () => {
    const period = resolvePeriod("28d");
    expect(period.days).toBe(28);
    expect(period.previousTo < period.from).toBe(true);
    const prev = previousPeriod(parseGoogleDate(period.from), parseGoogleDate(period.to));
    expect(prev.previousTo.toISOString().slice(0, 10)).toBe(period.previousTo);
  });

  it("requires from/to for custom ranges", () => {
    expect(() => resolvePeriod("custom")).toThrow();
    const custom = resolvePeriod("custom", "2026-08-01", "2026-08-31");
    expect(custom.days).toBe(31);
  });

  it("computes weighted position and period deltas", () => {
    const current = summarizeGsc([
      { clicks: 10, impressions: 100, ctr: 0.1, position: 4 },
      { clicks: 30, impressions: 300, ctr: 0.1, position: 8 },
    ]);
    const previous = summarizeGsc([{ clicks: 20, impressions: 200, ctr: 0.1, position: 10 }]);
    expect(current.clicks).toBe(40);
    expect(current.position).toBe(7);
    expect(deltaPct(40, 20)).toBe(100);
    expect(withDelta(current, previous).clicks.deltaPct).toBe(100);
    expect(weightedAverage([{ weight: 1, value: 2 }, { weight: 1, value: 4 }])).toBe(3);
  });

  it("truncates long GSC dimensions before unique keys", () => {
    expect(truncateDimension("a".repeat(600)).length).toBe(512);
  });
});
