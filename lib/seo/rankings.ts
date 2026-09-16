import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/log";
import { formatDateUTC, utcToday } from "@/lib/seo/dates";
import { estimateLiveSerpCostUsd, seoSerpConcurrency, seoSerpDepth, seoSerpStoreLimit } from "@/lib/seo/config";
import { BudgetExceededError, assertBudget, defaultSerpBudgets } from "@/lib/seo/budget";
import { beginJob, finishJob, jobKey, type SeoSyncTrigger } from "@/lib/seo/sync";
import { getSerpProvider } from "@/lib/seo/providers";
import { SerpProviderNotConfiguredError } from "@/lib/seo/providers/serp";
import type { SerpDevice } from "@/lib/seo/providers/serp";
import { findOwnResult, rankingPositionOf } from "@/lib/seo/own-result";
import { recordSeoApiUsage, loadProviderSpend } from "@/lib/seo/usage";
import { mapPool } from "@/lib/seo/pool";
import type { SerpResponse } from "@/lib/seo/providers/serp";

function createLock() {
  let tail = Promise.resolve();
  return async function runExclusive<T>(fn: () => Promise<T>) {
    const previous = tail;
    let release: () => void = () => {};
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

export type RankingSyncStats = {
  keywordsRequested: number;
  keywordsSkipped: number;
  keywordsSuccess: number;
  keywordsFailed: number;
  estimatedCost: number;
};

function asDevice(value: string): SerpDevice {
  return value === "mobile" ? "mobile" : "desktop";
}

export async function rankingExistsToday(seoKeywordId: string, day: Date) {
  const row = await prisma.seoRanking.findUnique({
    where: { seoKeywordId_date: { seoKeywordId, date: day } },
    select: { id: true },
  });
  return Boolean(row);
}

async function persistSerp(input: {
  keyword: {
    id: string;
    seoProjectId: string;
    country: string;
    language: string;
    device: string;
    location: string;
    currentPosition: number | null;
    bestPosition: number | null;
    worstPosition: number | null;
  };
  projectDomain: string | null;
  day: Date;
  providerName: string;
  response: SerpResponse;
}) {
  const own = findOwnResult(input.response.organic, input.projectDomain);
  const position = rankingPositionOf(own);
  const storeLimit = seoSerpStoreLimit();
  const stored = input.response.organic.filter((item, index) => index < storeLimit || (own && item.url === own.url));

  const snapshot = await prisma.seoSerpSnapshot.upsert({
    where: {
      seoKeywordId_date_provider_device: {
        seoKeywordId: input.keyword.id,
        date: input.day,
        provider: input.providerName,
        device: input.keyword.device,
      },
    },
    update: {
      features: input.response.features,
      itemCount: input.response.itemCount,
      metadata: { taskId: input.response.taskId, costUsd: input.response.costUsd },
    },
    create: {
      seoKeywordId: input.keyword.id,
      seoProjectId: input.keyword.seoProjectId,
      date: input.day,
      provider: input.providerName,
      country: input.keyword.country,
      language: input.keyword.language,
      device: input.keyword.device,
      location: input.keyword.location,
      features: input.response.features,
      itemCount: input.response.itemCount,
      metadata: { taskId: input.response.taskId, costUsd: input.response.costUsd },
    },
  });

  await prisma.seoSerpResult.deleteMany({ where: { snapshotId: snapshot.id } });
  if (stored.length) {
    await prisma.seoSerpResult.createMany({
      data: stored.map((item) => ({
        snapshotId: snapshot.id,
        position: item.position,
        rankGroup: item.rankGroup,
        rankAbsolute: item.rankAbsolute,
        domain: item.domain,
        url: item.url,
        title: item.title,
        description: item.description,
        type: item.type,
        isOwn: own ? item.url === own.url : false,
      })),
    });
  }

  await prisma.seoRanking.upsert({
    where: { seoKeywordId_date: { seoKeywordId: input.keyword.id, date: input.day } },
    update: {
      position,
      url: own?.url ?? null,
      domain: own?.domain ?? null,
      serpResultType: own?.type ?? null,
      provider: input.providerName,
      snapshotId: snapshot.id,
    },
    create: {
      seoKeywordId: input.keyword.id,
      date: input.day,
      position,
      url: own?.url ?? null,
      domain: own?.domain ?? null,
      serpResultType: own?.type ?? null,
      provider: input.providerName,
      snapshotId: snapshot.id,
    },
  });

  const previous = input.keyword.currentPosition;
  const best = [input.keyword.bestPosition, position].filter((value): value is number => value != null);
  const worst = [input.keyword.worstPosition, position].filter((value): value is number => value != null);
  await prisma.seoKeyword.update({
    where: { id: input.keyword.id },
    data: {
      previousPosition: previous,
      currentPosition: position,
      currentUrl: own?.url ?? null,
      bestPosition: best.length ? Math.min(...best) : input.keyword.bestPosition,
      worstPosition: worst.length ? Math.max(...worst) : input.keyword.worstPosition,
      lastSyncAt: new Date(),
      lastSyncStatus: "tracking",
      lastError: null,
    },
  });
}

export async function syncProjectRankings(
  seoProjectId: string,
  trigger: SeoSyncTrigger,
  options: { force?: boolean } = {},
) {
  const seoProject = await prisma.seoProject.findUnique({
    where: { id: seoProjectId },
    include: { project: { select: { name: true } }, gscProperty: { select: { hostname: true, siteUrl: true } } },
  });
  if (!seoProject) return { ok: false, error: "El proyecto SEO no existe." };

  const day = utcToday();
  const dayKey = formatDateUTC(day);
  const started = await beginJob({
    type: "update-rankings",
    trigger,
    seoProjectId,
    dateFrom: dayKey,
    dateTo: dayKey,
    idempotencyKey: jobKey(["update-rankings", seoProjectId, dayKey]),
    force: options.force,
  });
  if (started.skip) {
    return { ok: true, skipped: true, status: "skipped", job: started.job, stats: null };
  }

  let provider;
  try {
    provider = getSerpProvider();
  } catch (error) {
    const message = error instanceof SerpProviderNotConfiguredError ? error.message : "Proveedor SERP no configurado";
    await prisma.seoProject.update({
      where: { id: seoProjectId },
      data: { lastRankingsSyncAt: new Date(), lastRankingsSyncStatus: "error", lastRankingsError: message },
    });
    const job = await finishJob(started.job.id, "error", 0, message);
    return { ok: false, error: message, status: "error", job };
  }

  const keywords = await prisma.seoKeyword.findMany({
    where: { seoProjectId, active: true },
    orderBy: { createdAt: "asc" },
  });
  const stats: RankingSyncStats = {
    keywordsRequested: keywords.length,
    keywordsSkipped: 0,
    keywordsSuccess: 0,
    keywordsFailed: 0,
    estimatedCost: 0,
  };

  const limits = defaultSerpBudgets();
  const spendState = await loadProviderSpend("dataforseo");
  let spentDaily = spendState.dailyUsd;
  let spentMonthly = spendState.monthlyUsd;
  const nextCost = estimateLiveSerpCostUsd(seoSerpDepth());
  const projectDomain = seoProject.primaryDomain || seoProject.gscProperty?.hostname || seoProject.gscProperty?.siteUrl || null;
  const reserveBudget = createLock();

  try {
    await mapPool(keywords, seoSerpConcurrency(), async (keyword) => {
      if (await rankingExistsToday(keyword.id, day)) {
        stats.keywordsSkipped += 1;
        return;
      }
      await reserveBudget(async () => {
        assertBudget({ dailyUsd: spentDaily, monthlyUsd: spentMonthly }, limits, nextCost);
        spentDaily += nextCost;
        spentMonthly += nextCost;
      });

      const startedMs = Date.now();
      try {
        const response = await provider.getOrganicResults({
          keyword: keyword.keyword,
          country: keyword.country,
          language: keyword.language,
          device: asDevice(keyword.device),
          location: keyword.location || undefined,
          depth: seoSerpDepth(),
        });
        const cost = response.costUsd || nextCost;
        const delta = cost - nextCost;
        if (Math.abs(delta) > 1e-9) {
          spentDaily += delta;
          spentMonthly += delta;
        }
        stats.estimatedCost += cost;
        await recordSeoApiUsage({
          provider: provider.name,
          endpoint: "serp/google/organic/live/advanced",
          operation: "organic_serp",
          requests: 1,
          units: Math.max(1, Math.ceil(seoSerpDepth() / 10)),
          estimatedCost: cost,
          responseStatus: "success",
          durationMs: Date.now() - startedMs,
          seoProjectId,
        });
        await persistSerp({
          keyword,
          projectDomain,
          day,
          providerName: provider.name,
          response,
        });
        stats.keywordsSuccess += 1;
      } catch (error) {
        if (error instanceof BudgetExceededError) throw error;
        const message = error instanceof Error ? error.message : "Error SERP";
        stats.keywordsFailed += 1;
        await recordSeoApiUsage({
          provider: provider.name,
          endpoint: "serp/google/organic/live/advanced",
          operation: "organic_serp",
          requests: 1,
          units: 0,
          estimatedCost: 0,
          responseStatus: "error",
          durationMs: Date.now() - startedMs,
          seoProjectId,
        }).catch(() => null);
        await prisma.seoKeyword.update({
          where: { id: keyword.id },
          data: { lastSyncAt: new Date(), lastSyncStatus: "error", lastError: message.slice(0, 500) },
        });
        logEvent("error", "seo.rankings.keyword_failed", { seoKeywordId: keyword.id, seoProjectId });
      }
    });
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      await prisma.seoProject.update({
        where: { id: seoProjectId },
        data: { lastRankingsSyncAt: new Date(), lastRankingsSyncStatus: "budget_exceeded", lastRankingsError: error.message },
      });
      const job = await finishJob(started.job.id, "budget_exceeded", stats.keywordsSuccess, error.message, stats);
      logEvent("warn", "seo.rankings.budget_exceeded", { seoProjectId, scope: error.scope });
      return { ok: false, error: error.message, status: "budget_exceeded", job, stats };
    }
    const message = error instanceof Error ? error.message : "Error al actualizar rankings.";
    await finishJob(started.job.id, "error", stats.keywordsSuccess, message, stats);
    throw error;
  }

  await prisma.seoProject.update({
    where: { id: seoProjectId },
    data: {
      lastRankingsSyncAt: new Date(),
      lastRankingsSyncStatus: stats.keywordsFailed && !stats.keywordsSuccess ? "error" : "success",
      lastRankingsError: stats.keywordsFailed ? `${stats.keywordsFailed} keywords con error` : null,
    },
  });
  const job = await finishJob(started.job.id, "success", stats.keywordsSuccess, undefined, stats);
  logEvent("info", "seo.rankings.sync", { seoProjectId, ...stats, trigger });
  return { ok: true, status: "success", job, stats };
}
