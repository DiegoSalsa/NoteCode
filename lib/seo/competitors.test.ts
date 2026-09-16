import { describe, expect, it } from "vitest";
import { competitorMetrics, detectCompetitorCandidates, isExcludedCompetitor } from "@/lib/seo/competitors";
import { visibilityScore } from "@/lib/seo/visibility";
import { rankingEvents } from "@/lib/seo/rank-events";
import { getSerpProvider, SerpProviderNotConfiguredError } from "@/lib/seo/providers";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";

describe("competitor detection and visibility", () => {
  it("excludes the project domain and large verticals", () => {
    expect(isExcludedCompetitor("youtube.com", "puragenda.cl")).toBe(true);
    expect(isExcludedCompetitor("puragenda.cl", "puragenda.cl")).toBe(true);
    expect(isExcludedCompetitor("agendapro.com", "puragenda.cl")).toBe(false);
  });

  it("requires repeated overlap before suggesting a candidate", () => {
    const candidates = detectCompetitorCandidates(
      [
        { keywordId: "1", domains: ["agendapro.com", "google.com"] },
        { keywordId: "2", domains: ["agendapro.com"] },
        { keywordId: "3", domains: ["otro.cl"] },
      ],
      "puragenda.cl",
    );
    expect(candidates[0]?.domain).toBe("agendapro.com");
    expect(candidates[0]?.sharedKeywords).toBe(2);
    expect(candidates.some((item) => item.domain === "otro.cl")).toBe(false);
  });

  it("documents visibility as a CTR-weighted share of tracked SERPs", () => {
    expect(visibilityScore([1, 10], 2)).toBeCloseTo(100 * (0.3 + 0.02) / (2 * 0.3), 5);
    const metrics = competitorMetrics([3, 12, null], 3);
    expect(metrics.top3).toBe(1);
    expect(metrics.top10).toBe(1);
    expect(metrics.sharedKeywords).toBe(2);
  });
});

describe("ranking events", () => {
  it("emits enter/leave and URL change events", () => {
    const events = rankingEvents([
      { date: "2026-09-01", position: 18, url: "/a" },
      { date: "2026-09-02", position: 9, url: "/a" },
      { date: "2026-09-03", position: 2, url: "/b" },
      { date: "2026-09-04", position: 14, url: "/b" },
    ]);
    expect(events.some((item) => item.type === "entered_top_10")).toBe(true);
    expect(events.some((item) => item.type === "entered_top_3")).toBe(true);
    expect(events.some((item) => item.type === "left_top_10")).toBe(true);
    expect(events.some((item) => item.type === "url_changed")).toBe(true);
  });
});

describe("serp provider factory", () => {
  it("does not expose credentials and fails closed when unset", () => {
    const previousLogin = process.env.DATAFORSEO_LOGIN;
    const previousPassword = process.env.DATAFORSEO_PASSWORD;
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
    expect(() => getSerpProvider()).toThrow(SerpProviderNotConfiguredError);
    try {
      getSerpProvider();
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain("password");
    }
    process.env.DATAFORSEO_LOGIN = previousLogin;
    process.env.DATAFORSEO_PASSWORD = previousPassword;
  });
});

describe("manual ranking cooldown", () => {
  it("blocks a second sync inside the window", () => {
    resetRateLimit();
    expect(rateLimit("seo-rankings:u1", 1, 10 * 60_000).ok).toBe(true);
    expect(rateLimit("seo-rankings:u1", 1, 10 * 60_000).ok).toBe(false);
  });
});
