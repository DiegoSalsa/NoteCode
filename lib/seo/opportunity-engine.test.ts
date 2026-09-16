import { describe, expect, it } from "vitest";
import {
  detectCannibalization,
  detectDecay,
  detectKeywordGaps,
  detectLowCtr,
  detectNearWins,
  expectedCtr,
} from "@/lib/seo/opportunity-engine";
import { opportunityConfidence, opportunityScore } from "@/lib/seo/opportunity-score";
import { isCacheFresh } from "@/lib/seo/providers/research";
import { pageKey } from "@/lib/seo/domain";

describe("near wins", () => {
  it("detects positions 4-20 and skips 3 or 21", () => {
    const found = detectNearWins([
      { keyword: "a", position: 11, impressions: 200, source: "gsc" },
      { keyword: "b", position: 3, impressions: 200, source: "gsc" },
      { keyword: "c", position: 21, impressions: 200, source: "gsc" },
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]?.keyword).toBe("a");
  });

  it("ignores GSC near-wins with too few impressions", () => {
    expect(detectNearWins([{ keyword: "x", position: 8, impressions: 10, source: "gsc" }])).toHaveLength(0);
  });
});

describe("CTR opportunities", () => {
  it("requires impressions, reasonable position and CTR below internal baseline", () => {
    const pos = 5;
    const expected = expectedCtr(pos);
    const impressions = 4100;
    const clicks = Math.round(expected * impressions * 0.2);
    const found = detectLowCtr([{ keyword: "agenda", position: pos, impressions, clicks, ctr: clicks / impressions }]);
    expect(found).toHaveLength(1);
    expect(detectLowCtr([{ keyword: "tiny", position: 5, impressions: 20, clicks: 0, ctr: 0 }])).toHaveLength(0);
  });
});

describe("content decay", () => {
  it("requires absolute and percentage drop, not 2→1 clicks", () => {
    expect(detectDecay([{ url: "https://puragenda.cl/a", clicksNow: 1, clicksPrev: 2, impressionsNow: 10, impressionsPrev: 12 }])).toHaveLength(0);
    expect(detectDecay([{ url: "https://puragenda.cl/a", clicksNow: 91, clicksPrev: 180, impressionsNow: 2100, impressionsPrev: 3200 }])).toHaveLength(1);
  });
});

describe("cannibalization", () => {
  it("needs temporal evidence on multiple URLs", () => {
    expect(detectCannibalization([{
      query: "agenda",
      pages: [
        { page: "https://puragenda.cl/a", days: 2, impressions: 40, clicks: 2 },
        { page: "https://puragenda.cl/b", days: 2, impressions: 30, clicks: 1 },
      ],
    }])).toHaveLength(0);
    expect(detectCannibalization([{
      query: "agenda",
      pages: [
        { page: "https://puragenda.cl/a", days: 12, impressions: 400, clicks: 20 },
        { page: "https://puragenda.cl/b", days: 9, impressions: 300, clicks: 10 },
      ],
    }])).toHaveLength(1);
  });
});

describe("keyword gap", () => {
  it("flags competitor ranking when we do not", () => {
    const rows = detectKeywordGaps([
      { keyword: "agenda centros", competitor: "miagendapp.cl", competitorPosition: 6, ours: null, volume: 480 },
      { keyword: "agenda", competitor: "miagendapp.cl", competitorPosition: 8, ours: 3 },
    ]);
    expect(rows.some((row) => row.keyword === "agenda centros")).toBe(true);
    expect(rows.some((row) => row.keyword === "agenda")).toBe(false);
  });
});

describe("opportunity score and cache", () => {
  it("is deterministic and stays 0-100", () => {
    const a = opportunityScore("NEAR_WIN", { impressions: 4000, position: 8 });
    const b = opportunityScore("NEAR_WIN", { impressions: 4000, position: 8 });
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(100);
    expect(opportunityConfidence({ impressions: 4000 }, { days: 28 })).toBe("HIGH");
    expect(opportunityConfidence({ impressions: 10 })).toBe("LOW");
  });

  it("treats cache as fresh only before expiry", () => {
    expect(isCacheFresh(new Date(Date.now() + 1000))).toBe(true);
    expect(isCacheFresh(new Date(Date.now() - 1000))).toBe(false);
  });

  it("joins URLs via pageKey, not LIKE", () => {
    expect(pageKey("https://www.Puragenda.cl/Software-Agenda-Barberias/")).toBe("puragenda.cl/software-agenda-barberias");
    expect(pageKey("/x", "puragenda.cl")).toBe("puragenda.cl/x");
  });
});
