import { isOwnDomain, isSubdomainOf, normalizeDomain } from "@/lib/seo/domain";
import { ctrWeight, visibilityScore } from "@/lib/seo/visibility";

const DEFAULT_EXCLUDE = [
  "google.com",
  "google.cl",
  "youtube.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "wikipedia.org",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "reddit.com",
  "pinterest.com",
  "amazon.com",
  "mercadolibre.cl",
  "mercadolibre.com",
];

export function excludedCompetitorDomains() {
  const extra = (process.env.SEO_COMPETITOR_EXCLUDE_DOMAINS || "")
    .split(",")
    .map((item) => normalizeDomain(item))
    .filter(Boolean);
  return new Set([...DEFAULT_EXCLUDE, ...extra]);
}

export function isExcludedCompetitor(domain: string, projectDomain?: string | null) {
  const normalized = normalizeDomain(domain);
  if (!normalized) return true;
  if (isOwnDomain(normalized, projectDomain)) return true;
  for (const blocked of excludedCompetitorDomains()) {
    if (isSubdomainOf(normalized, blocked) || isSubdomainOf(blocked, normalized)) return true;
  }
  return false;
}

export type DetectedCandidate = {
  domain: string;
  sharedKeywords: number;
  totalKeywords: number;
};

export function detectCompetitorCandidates(
  keywordDomains: Array<{ keywordId: string; domains: string[] }>,
  projectDomain: string | null | undefined,
  minShared = 2,
): DetectedCandidate[] {
  const total = keywordDomains.length;
  const counts = new Map<string, number>();
  for (const row of keywordDomains) {
    const unique = new Set(row.domains.map((item) => normalizeDomain(item)).filter(Boolean));
    for (const domain of unique) {
      if (isExcludedCompetitor(domain, projectDomain)) continue;
      counts.set(domain, (counts.get(domain) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([domain, sharedKeywords]) => ({ domain, sharedKeywords, totalKeywords: total }))
    .filter((item) => item.sharedKeywords >= minShared)
    .sort((a, b) => b.sharedKeywords - a.sharedKeywords);
}

export function competitorMetrics(positions: Array<number | null>, trackedSerps: number) {
  const ranked = positions.filter((value): value is number => value != null && value > 0);
  return {
    sharedKeywords: ranked.length,
    top3: ranked.filter((value) => value <= 3).length,
    top10: ranked.filter((value) => value <= 10).length,
    top20: ranked.filter((value) => value <= 20).length,
    averagePosition: ranked.length ? ranked.reduce<number>((sum, value) => sum + value, 0) / ranked.length : null,
    shareOfTracked: trackedSerps > 0 ? ranked.length / trackedSerps : 0,
    visibility: visibilityScore(positions, trackedSerps),
    ctrWeightSum: positions.reduce<number>((sum, value) => sum + ctrWeight(value), 0),
  };
}
