export type KeywordIntent = "informational" | "navigational" | "commercial" | "transactional" | string;

export type KeywordMetrics = {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  competition: number | null;
  competitionLevel: string | null;
  intent: KeywordIntent | null;
  intents: string[];
  monthlyTrend: Array<{ year: number; month: number; searchVolume: number }>;
};

export type KeywordResearchQuery = {
  keyword: string;
  country: string;
  language: string;
  limit?: number;
};

export interface KeywordResearchProvider {
  readonly name: string;
  getKeywordOverview(query: KeywordResearchQuery): Promise<{ metrics: KeywordMetrics; costUsd: number }>;
  getSuggestions(query: KeywordResearchQuery): Promise<{ items: KeywordMetrics[]; costUsd: number }>;
  getRelatedKeywords(query: KeywordResearchQuery): Promise<{ items: KeywordMetrics[]; costUsd: number }>;
  getQuestions(query: KeywordResearchQuery): Promise<{ items: KeywordMetrics[]; costUsd: number }>;
}

export class KeywordResearchNotConfiguredError extends Error {
  constructor() {
    super("Proveedor de keyword research no configurado");
    this.name = "KeywordResearchNotConfiguredError";
  }
}

export function estimateResearchCostUsd(items = 1) {
  const task = Number(process.env.SEO_DATAFORSEO_LABS_TASK_USD || "0.012");
  const item = Number(process.env.SEO_DATAFORSEO_LABS_ITEM_USD || "0.00012");
  return (Number.isFinite(task) ? task : 0.012) + (Number.isFinite(item) ? item : 0.00012) * Math.max(1, items);
}

export function researchCacheDays() {
  const days = Number(process.env.SEO_KEYWORD_RESEARCH_CACHE_DAYS || "30");
  return Number.isFinite(days) && days > 0 ? days : 30;
}

export function isCacheFresh(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() > now.getTime();
}
