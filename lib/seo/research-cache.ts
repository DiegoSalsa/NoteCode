import { prisma } from "@/lib/prisma";
import { normalizeKeyword } from "@/lib/seo/domain";
import { isCacheFresh, researchCacheDays } from "@/lib/seo/providers/research";
import { getKeywordResearchProvider } from "@/lib/seo/providers/dataforseo-research";
import { recordSeoApiUsage } from "@/lib/seo/usage";
import { assertBudget, defaultSerpBudgets } from "@/lib/seo/budget";
import { loadProviderSpend } from "@/lib/seo/usage";
import { estimateResearchCostUsd } from "@/lib/seo/providers/research";
import type { KeywordMetrics } from "@/lib/seo/providers/research";

export type ResearchBundle = {
  overview: KeywordMetrics;
  suggestions: KeywordMetrics[];
  related: KeywordMetrics[];
  questions: KeywordMetrics[];
  cached: Record<string, boolean>;
  costUsd: number;
  estimatedCostUsd: number;
};

async function readCache(dataset: string, keyword: string, country: string, language: string) {
  const row = await prisma.seoKeywordResearchCache.findUnique({
    where: {
      provider_dataset_keywordNormalized_country_language: {
        provider: "dataforseo",
        dataset,
        keywordNormalized: normalizeKeyword(keyword),
        country: country.toUpperCase(),
        language: language.toLowerCase(),
      },
    },
  });
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  return row.payload;
}

async function writeCache(dataset: string, keyword: string, country: string, language: string, payload: unknown, cost: number) {
  const expiresAt = new Date(Date.now() + researchCacheDays() * 86_400_000);
  await prisma.seoKeywordResearchCache.upsert({
    where: {
      provider_dataset_keywordNormalized_country_language: {
        provider: "dataforseo",
        dataset,
        keywordNormalized: normalizeKeyword(keyword),
        country: country.toUpperCase(),
        language: language.toLowerCase(),
      },
    },
    update: { payload: payload as object, estimatedCost: cost, fetchedAt: new Date(), expiresAt },
    create: {
      provider: "dataforseo",
      dataset,
      keywordNormalized: normalizeKeyword(keyword),
      country: country.toUpperCase(),
      language: language.toLowerCase(),
      payload: payload as object,
      estimatedCost: cost,
      expiresAt,
    },
  });
}

export { isCacheFresh };

export async function researchKeyword(input: {
  keyword: string;
  country: string;
  language: string;
  includeSuggestions?: boolean;
  seoProjectId?: string | null;
  force?: boolean;
}): Promise<ResearchBundle> {
  const provider = getKeywordResearchProvider();
  const datasets = input.includeSuggestions === false ? ["overview"] : ["overview", "suggestions", "related"];
  const cached: Record<string, boolean> = {};
  let costUsd = 0;
  const estimated = datasets.length * estimateResearchCostUsd(20);
  const spend = await loadProviderSpend("dataforseo");
  assertBudget({ dailyUsd: spend.dailyUsd, monthlyUsd: spend.monthlyUsd }, defaultSerpBudgets(), estimated);

  async function load<T>(dataset: string, fetcher: () => Promise<{ payload: T; cost: number }>): Promise<T> {
    if (!input.force) {
      const hit = await readCache(dataset, input.keyword, input.country, input.language);
      if (hit) {
        cached[dataset] = true;
        return hit as T;
      }
    }
    cached[dataset] = false;
    const started = Date.now();
    const result = await fetcher();
    costUsd += result.cost;
    await writeCache(dataset, input.keyword, input.country, input.language, result.payload, result.cost);
    await recordSeoApiUsage({
      provider: "dataforseo",
      endpoint: `dataforseo_labs/google/${dataset}`,
      operation: `keyword_research_${dataset}`,
      requests: 1,
      units: 1,
      estimatedCost: result.cost,
      responseStatus: "success",
      durationMs: Date.now() - started,
      seoProjectId: input.seoProjectId ?? null,
    });
    return result.payload;
  }

  const overview = await load<KeywordMetrics>("overview", async () => {
    const result = await provider.getKeywordOverview(input);
    return { payload: result.metrics, cost: result.costUsd };
  });
  let suggestions: KeywordMetrics[] = [];
  let related: KeywordMetrics[] = [];
  let questions: KeywordMetrics[] = [];
  if (datasets.includes("suggestions")) {
    suggestions = await load("suggestions", async () => {
      const result = await provider.getSuggestions(input);
      return { payload: result.items, cost: result.costUsd };
    });
    related = await load("related", async () => {
      const result = await provider.getRelatedKeywords(input);
      return { payload: result.items, cost: result.costUsd };
    });
    questions = [...suggestions, ...related].filter((item) =>
      /^(cómo|como|qué|que|cuál|cual|cuánto|cuanto|dónde|donde|por qué|porque|who|what|why|how|when|where|which)\b/i.test(item.keyword.trim()),
    );
  }

  return { overview, suggestions, related, questions, cached, costUsd, estimatedCostUsd: estimated };
}
