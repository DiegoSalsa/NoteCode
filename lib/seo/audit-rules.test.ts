import { describe, expect, it } from "vitest";
import { evaluatePages, identityKey } from "@/lib/seo/audit-rules";
import { healthScore } from "@/lib/seo/health";
import { diffIssues } from "@/lib/seo/alerts";
import { parseRobots, isDisallowed } from "@/lib/seo/robots";
import { parseSitemapXml } from "@/lib/seo/sitemap";
import { extractHtml } from "@/lib/seo/html-extract";
import { estimateSerpCostUsd, seoSerpModeForTrigger } from "@/lib/seo/config";
import { isDataForSeoPending } from "@/lib/seo/providers/dataforseo-parse";

const page = (overrides: Partial<Parameters<typeof evaluatePages>[0][0]>): Parameters<typeof evaluatePages>[0][0] => ({
  url: "https://puragenda.cl/",
  normalizedUrl: "https://puragenda.cl/",
  statusCode: 200,
  depth: 0,
  indexable: true,
  indexableReasons: [],
  canonical: "https://puragenda.cl/",
  title: "Home",
  description: "desc",
  h1: "Home",
  h1Count: 1,
  discoveredFrom: "seed",
  internalIn: 1,
  error: null,
  structuredTypes: [],
  ogTitle: "Home",
  twitterCard: "summary",
  contentHash: "a",
  ...overrides,
});

describe("audit rules", () => {
  it("flags missing title, missing H1, 404 and noindex", () => {
    const findings = evaluatePages([
      page({ title: null }),
      page({ url: "https://puragenda.cl/h", normalizedUrl: "https://puragenda.cl/h", h1: null, title: "H" }),
      page({ url: "https://puragenda.cl/missing", normalizedUrl: "https://puragenda.cl/missing", statusCode: 404, indexable: false }),
      page({ url: "https://puragenda.cl/old", normalizedUrl: "https://puragenda.cl/old", indexableReasons: ["noindex"], indexable: false }),
    ]);
    expect(findings.some((item) => item.ruleKey === "TITLE_MISSING")).toBe(true);
    expect(findings.some((item) => item.ruleKey === "H1_MISSING")).toBe(true);
    expect(findings.some((item) => item.ruleKey === "HTTP_404")).toBe(true);
    expect(findings.some((item) => item.ruleKey === "NOINDEX")).toBe(true);
  });

  it("flags duplicate titles", () => {
    const findings = evaluatePages([
      page({ url: "https://puragenda.cl/a", normalizedUrl: "https://puragenda.cl/a", title: "Same" }),
      page({ url: "https://puragenda.cl/b", normalizedUrl: "https://puragenda.cl/b", title: "Same" }),
    ]);
    expect(findings.filter((item) => item.ruleKey === "TITLE_DUPLICATE")).toHaveLength(2);
  });
});

describe("health formula", () => {
  it("stays within 0-100 and does not explode with repeated issues", () => {
    const many = Array.from({ length: 200 }, () => ({ ruleKey: "TITLE_MISSING", severity: "MEDIUM" }));
    const result = healthScore(many, 200);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThan(80);
  });

  it("weights critical higher than info", () => {
    const critical = healthScore([{ ruleKey: "HOME_5XX", severity: "CRITICAL" }], 10);
    const info = healthScore([{ ruleKey: "OG_MISSING", severity: "INFO" }], 10);
    expect(critical.penalty).toBeGreaterThan(info.penalty);
  });
});

describe("crawl diff and robots/sitemaps", () => {
  it("classifies new, resolved and persistent issues", () => {
    const diff = diffIssues(
      [{ identityKey: "HTTP_404|/a", ruleKey: "HTTP_404" }, { identityKey: "TITLE_MISSING|/b", ruleKey: "TITLE_MISSING" }],
      [{ identityKey: "HTTP_404|/a", ruleKey: "HTTP_404" }, { identityKey: "H1_MISSING|/c", ruleKey: "H1_MISSING" }],
    );
    expect(diff.newIssues).toHaveLength(1);
    expect(diff.resolvedIssues).toHaveLength(1);
    expect(diff.persistingIssues).toHaveLength(1);
    expect(identityKey("HTTP_404", "/a")).toBe("HTTP_404|/a");
  });

  it("parses robots and sitemap index", () => {
    const robots = parseRobots("User-agent: *\nDisallow: /admin\nSitemap: https://puragenda.cl/sitemap.xml");
    expect(isDisallowed("/admin/x", robots)).toBe(true);
    expect(isDisallowed("/ok", robots)).toBe(false);
    const sitemap = parseSitemapXml("<sitemapindex><sitemap><loc>https://puragenda.cl/s1.xml</loc></sitemap></sitemapindex>");
    expect(sitemap.kind).toBe("index");
    expect(sitemap.urls[0]?.url).toContain("s1.xml");
  });

  it("extracts title, canonical and json-ld", () => {
    const html = extractHtml(`<html><head><title>Hola</title><link rel="canonical" href="https://puragenda.cl/" /><script type="application/ld+json">{"@type":"Organization"}</script></head><body><h1>Hola</h1><a href="/x">x</a></body></html>`);
    expect(html.title).toBe("Hola");
    expect(html.canonical).toBe("https://puragenda.cl/");
    expect(html.jsonLdTypes).toContain("Organization");
    expect(html.h1s[0]).toBe("Hola");
  });
});

describe("serp modes and costs", () => {
  it("uses live for manual and standard for cron by default", () => {
    expect(seoSerpModeForTrigger("manual")).toBe("live");
    expect(seoSerpModeForTrigger("cron")).toBe("standard");
    expect(estimateSerpCostUsd("standard", 100)).toBeCloseTo(0.006);
    expect(estimateSerpCostUsd("live", 100)).toBeCloseTo(0.02);
    expect(isDataForSeoPending({ status_code: 40601 })).toBe(true);
    expect(isDataForSeoPending({ status_code: 20000, tasks: [{ status_code: 20000 }] })).toBe(false);
  });
});
