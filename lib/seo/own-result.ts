import { isOwnDomain } from "@/lib/seo/domain";
import type { SerpOrganicResult } from "@/lib/seo/providers/serp";

export function findOwnResult(organic: SerpOrganicResult[], projectDomain: string | null | undefined) {
  const featured = organic.find((item) => item.type === "featured_snippet" && isOwnDomain(item.domain, projectDomain));
  if (featured) return featured;
  return organic.find((item) => item.type === "organic" && isOwnDomain(item.domain, projectDomain)) ?? null;
}

export function rankingPositionOf(result: SerpOrganicResult | null) {
  if (!result) return null;
  if (result.type === "featured_snippet") return result.rankAbsolute ?? 1;
  return result.rankGroup ?? result.position;
}
