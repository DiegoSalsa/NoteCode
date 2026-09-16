import { normalizeDomain } from "@/lib/seo/domain";
import type { SerpDevice, SerpFeature, SerpOrganicResult, SerpResponse } from "@/lib/seo/providers/serp";

export type DataForSeoLiveResponse = {
  status_code?: number;
  status_message?: string;
  cost?: number;
  tasks?: Array<{
    id?: string;
    status_code?: number;
    status_message?: string;
    cost?: number;
    result?: Array<{
      keyword?: string;
      items_count?: number;
      items?: Array<{
        type?: string;
        rank_group?: number;
        rank_absolute?: number;
        domain?: string;
        url?: string;
        title?: string;
        description?: string;
      }>;
    }>;
  }>;
};

const FEATURE_TYPES: Record<string, SerpFeature> = {
  featured_snippet: "featured_snippet",
  people_also_ask: "people_also_ask",
  people_also_ask_element: "people_also_ask",
  local_pack: "local_pack",
  images: "images",
  video: "videos",
  videos: "videos",
  shopping: "shopping",
  popular_products: "shopping",
  ai_overview: "ai_overview",
  ai_overview_element: "ai_overview",
  google_reviews: "local_pack",
};

export function parseDataForSeoSerp(payload: DataForSeoLiveResponse, device: SerpDevice = "desktop"): SerpResponse {
  const task = payload.tasks?.[0];
  const result = task?.result?.[0];
  const items = result?.items ?? [];
  const features = new Set<SerpFeature>();
  const organic: SerpOrganicResult[] = [];

  for (const item of items) {
    const type = (item.type || "").toLowerCase();
    if (FEATURE_TYPES[type]) features.add(FEATURE_TYPES[type]);
    if (type === "organic" || type === "featured_snippet") {
      const url = item.url || "";
      const domain = normalizeDomain(item.domain || url);
      if (!url || !domain) continue;
      organic.push({
        position: type === "organic" ? item.rank_group ?? item.rank_absolute ?? organic.length + 1 : 1,
        rankGroup: item.rank_group ?? null,
        rankAbsolute: item.rank_absolute ?? null,
        url,
        domain,
        title: item.title || "",
        description: item.description || "",
        type: type === "featured_snippet" ? "featured_snippet" : "organic",
      });
    }
  }

  const status = task?.status_code ?? payload.status_code ?? 0;
  if (status !== 20000) {
    throw new Error(task?.status_message || payload.status_message || `DataForSEO status ${status}`);
  }

  return {
    provider: "dataforseo",
    keyword: result?.keyword || "",
    device,
    costUsd: Number(task?.cost ?? payload.cost ?? 0) || 0,
    organic,
    features: [...features],
    itemCount: result?.items_count ?? items.length,
    taskId: task?.id ?? null,
  };
}
