import { describe, expect, it } from "vitest";
import { parseDataForSeoSerp } from "@/lib/seo/providers/dataforseo-parse";
import { findOwnResult, rankingPositionOf } from "@/lib/seo/own-result";

const fixture = {
  status_code: 20000,
  cost: 0.002,
  tasks: [
    {
      id: "task-1",
      status_code: 20000,
      cost: 0.002,
      result: [
        {
          keyword: "agenda online chile",
          items_count: 4,
          items: [
            { type: "featured_snippet", rank_group: 1, rank_absolute: 1, domain: "otro.cl", url: "https://otro.cl/x", title: "Otro", description: "" },
            { type: "organic", rank_group: 1, rank_absolute: 2, domain: "miagendapp.cl", url: "https://miagendapp.cl/", title: "Mia", description: "" },
            { type: "organic", rank_group: 2, rank_absolute: 3, domain: "www.puragenda.cl", url: "https://www.puragenda.cl/agenda", title: "Pura", description: "" },
            { type: "people_also_ask", rank_absolute: 4 },
            { type: "ai_overview" },
          ],
        },
      ],
    },
  ],
};

describe("dataforseo parser", () => {
  it("extracts organic results, features and cost without keeping the raw payload", () => {
    const parsed = parseDataForSeoSerp(fixture);
    expect(parsed.costUsd).toBe(0.002);
    expect(parsed.features).toContain("featured_snippet");
    expect(parsed.features).toContain("people_also_ask");
    expect(parsed.features).toContain("ai_overview");
    expect(parsed.organic.some((item) => item.domain === "puragenda.cl")).toBe(true);
  });

  it("identifies the project domain and its organic position", () => {
    const parsed = parseDataForSeoSerp(fixture);
    const own = findOwnResult(parsed.organic, "puragenda.cl");
    expect(own?.url).toContain("puragenda.cl");
    expect(rankingPositionOf(own)).toBe(2);
  });

  it("fails closed on a non-success DataForSEO status", () => {
    expect(() => parseDataForSeoSerp({ status_code: 40100, status_message: "Auth failed", tasks: [] })).toThrow(/Auth failed|40100/);
  });
});
