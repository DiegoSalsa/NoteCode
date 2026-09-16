import { fetchJsonWithRetry } from "@/lib/seo/http";
import { countryLocation } from "@/lib/seo/providers/dataforseo";
import {
  KeywordResearchNotConfiguredError,
  estimateResearchCostUsd,
  type KeywordMetrics,
  type KeywordResearchProvider,
  type KeywordResearchQuery,
} from "@/lib/seo/providers/research";

type LabsResponse = {
  status_code?: number;
  cost?: number;
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    cost?: number;
    result?: Array<{
      items?: Array<Record<string, unknown>>;
      seed_keyword_data?: Record<string, unknown>;
    }>;
  }>;
};

function auth(login: string, password: string) {
  return `Basic ${Buffer.from(`${login}:${password}`, "utf8").toString("base64")}`;
}

function locationPayload(query: KeywordResearchQuery) {
  const mapped = countryLocation(query.country);
  return mapped
    ? { location_code: mapped.code, language_code: query.language }
    : { location_name: query.country, language_code: query.language };
}

function asMetrics(keyword: string, info: Record<string, unknown> | undefined, intentInfo?: Record<string, unknown>): KeywordMetrics {
  const keywordInfo = (info?.keyword_info as Record<string, unknown> | undefined) ?? info;
  const monthly = Array.isArray(keywordInfo?.monthly_searches)
    ? (keywordInfo.monthly_searches as Array<{ year?: number; month?: number; search_volume?: number }>).map((row) => ({
      year: Number(row.year || 0),
      month: Number(row.month || 0),
      searchVolume: Number(row.search_volume || 0),
    }))
    : [];
  const main = (intentInfo?.main_intent as string | undefined) || (info?.search_intent_info as Record<string, unknown> | undefined)?.main_intent as string | undefined;
  const foreign = (intentInfo?.foreign_intent as string[] | undefined) || [];
  return {
    keyword,
    searchVolume: keywordInfo?.search_volume == null ? null : Number(keywordInfo.search_volume),
    cpc: keywordInfo?.cpc == null ? null : Number(keywordInfo.cpc),
    competition: keywordInfo?.competition == null ? null : Number(keywordInfo.competition),
    competitionLevel: (keywordInfo?.competition_level as string | undefined) ?? null,
    intent: main ? String(main) : null,
    intents: [main, ...foreign].filter(Boolean).map(String),
    monthlyTrend: monthly,
  };
}

function parseItem(item: Record<string, unknown>): KeywordMetrics | null {
  const keyword = String(item.keyword || item.seed_keyword || (item.keyword_data as Record<string, unknown> | undefined)?.keyword || "");
  if (!keyword) return null;
  const data = (item.keyword_data as Record<string, unknown> | undefined) || item;
  const intent = (data.search_intent_info as Record<string, unknown> | undefined) || (item.search_intent_info as Record<string, unknown> | undefined);
  return asMetrics(keyword, data, intent);
}

function isQuestion(keyword: string) {
  return /^(cómo|como|qué|que|cuál|cual|cuánto|cuanto|dónde|donde|por qué|porque|who|what|why|how|when|where|which)\b/i.test(keyword.trim());
}

export class DataForSeoKeywordResearchProvider implements KeywordResearchProvider {
  readonly name = "dataforseo";
  constructor(private credentials: { login: string; password: string }) {}

  private async post(url: string, body: unknown) {
    const { data } = await fetchJsonWithRetry<LabsResponse>(
      url,
      {
        method: "POST",
        headers: { Authorization: auth(this.credentials.login, this.credentials.password), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      { timeoutMs: 45_000, retries: 1, retryOn: [429, 500, 502, 503, 504] },
    );
    const task = data.tasks?.[0];
    if ((task?.status_code ?? data.status_code) !== 20000) {
      throw new Error(task?.status_message || "DataForSEO Labs no devolvió resultados.");
    }
    return { data, cost: Number(task?.cost ?? data.cost ?? 0) };
  }

  async getKeywordOverview(query: KeywordResearchQuery) {
    const { data, cost } = await this.post("https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_overview/live", [{
      keywords: [query.keyword],
      ...locationPayload(query),
    }]);
    const item = data.tasks?.[0]?.result?.[0]?.items?.[0] as Record<string, unknown> | undefined;
    const metrics = item ? parseItem(item) : asMetrics(query.keyword, undefined);
    return { metrics: metrics ?? asMetrics(query.keyword, undefined), costUsd: cost || estimateResearchCostUsd(1) };
  }

  async getSuggestions(query: KeywordResearchQuery) {
    const limit = Math.min(50, query.limit ?? 20);
    const { data, cost } = await this.post("https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live", [{
      keyword: query.keyword,
      ...locationPayload(query),
      limit,
    }]);
    const items = (data.tasks?.[0]?.result?.[0]?.items ?? []).map((item) => parseItem(item as Record<string, unknown>)).filter(Boolean) as KeywordMetrics[];
    return { items, costUsd: cost || estimateResearchCostUsd(items.length || limit) };
  }

  async getRelatedKeywords(query: KeywordResearchQuery) {
    const limit = Math.min(50, query.limit ?? 20);
    const { data, cost } = await this.post("https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live", [{
      keyword: query.keyword,
      ...locationPayload(query),
      limit,
      depth: 1,
    }]);
    const items = (data.tasks?.[0]?.result?.[0]?.items ?? []).map((item) => parseItem(item as Record<string, unknown>)).filter(Boolean) as KeywordMetrics[];
    return { items, costUsd: cost || estimateResearchCostUsd(items.length || limit) };
  }

  async getQuestions(query: KeywordResearchQuery) {
    const suggestions = await this.getSuggestions({ ...query, limit: Math.max(40, query.limit ?? 20) });
    const items = suggestions.items.filter((item) => isQuestion(item.keyword)).slice(0, query.limit ?? 20);
    return { items, costUsd: suggestions.costUsd };
  }
}

export function getKeywordResearchProvider(): KeywordResearchProvider {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  if (!login || !password) throw new KeywordResearchNotConfiguredError();
  return new DataForSeoKeywordResearchProvider({ login, password });
}
