import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addUtcDays, utcToday } from "@/lib/seo/dates";
import { pageKey, targetUrlMismatch } from "@/lib/seo/domain";
import {
  detectCannibalization,
  detectDecay,
  detectKeywordGaps,
  detectLowCtr,
  detectNearWins,
  detectTargetMismatch,
  detectTechnicalHighTraffic,
  type OpportunityDraft,
} from "@/lib/seo/opportunity-engine";
import { logEvent } from "@/lib/log";

function range(from: Date, to: Date) {
  return { gte: from, lte: to };
}

export async function analyzeProjectOpportunities(seoProjectId: string) {
  const project = await prisma.seoProject.findUnique({
    where: { id: seoProjectId },
    include: {
      keywords: true,
      competitors: { where: { active: true } },
      gscProperty: { select: { hostname: true, siteUrl: true } },
    },
  });
  if (!project) return { ok: false, error: "Proyecto SEO no encontrado." };
  const host = project.primaryDomain || project.gscProperty?.hostname || null;
  const end = utcToday();
  const from = addUtcDays(end, -27);
  const prevFrom = addUtcDays(from, -28);
  const prevTo = addUtcDays(from, -1);

  const [gscQueries, gscPagesNow, gscPagesPrev, queryPages, ga4Now, ga4Prev, snapshots, latestCrawl] = await Promise.all([
    prisma.seoGscQueryDaily.findMany({ where: { seoProjectId, date: range(from, end) } }),
    prisma.seoGscPageDaily.findMany({ where: { seoProjectId, date: range(from, end) } }),
    prisma.seoGscPageDaily.findMany({ where: { seoProjectId, date: range(prevFrom, prevTo) } }),
    prisma.seoGscQueryPageDaily.findMany({ where: { seoProjectId, date: range(from, end) } }),
    prisma.seoGa4LandingDaily.findMany({ where: { seoProjectId, date: range(from, end) } }),
    prisma.seoGa4LandingDaily.findMany({ where: { seoProjectId, date: range(prevFrom, prevTo) } }),
    prisma.seoSerpSnapshot.findMany({
      where: { seoProjectId },
      orderBy: { date: "desc" },
      distinct: ["seoKeywordId"],
      include: { results: { where: { type: { in: ["organic", "featured_snippet"] } }, select: { domain: true, position: true, url: true, isOwn: true } }, seoKeyword: { select: { keyword: true, currentPosition: true } } },
    }),
    prisma.seoCrawl.findFirst({ where: { seoProjectId, status: "completed" }, orderBy: { createdAt: "desc" }, include: { issues: true } }),
  ]);

  const queryAgg = new Map<string, { clicks: number; impressions: number; posW: number }>();
  for (const row of gscQueries) {
    const current = queryAgg.get(row.query) ?? { clicks: 0, impressions: 0, posW: 0 };
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    current.posW += row.position * row.impressions;
    queryAgg.set(row.query, current);
  }

  const drafts: OpportunityDraft[] = [];
  drafts.push(...detectNearWins(
    [
      ...project.keywords.filter((item) => item.currentPosition != null).map((item) => ({
        keyword: item.keyword,
        position: item.currentPosition,
        url: item.currentUrl,
        source: "tracked",
      })),
      ...[...queryAgg.entries()].map(([keyword, stats]) => ({
        keyword,
        position: stats.impressions > 0 ? stats.posW / stats.impressions : null,
        impressions: stats.impressions,
        source: "gsc",
      })),
    ],
    host,
  ));
  drafts.push(...detectLowCtr(
    [...queryAgg.entries()].map(([keyword, stats]) => ({
      keyword,
      position: stats.impressions > 0 ? stats.posW / stats.impressions : 100,
      impressions: stats.impressions,
      clicks: stats.clicks,
      ctr: stats.impressions > 0 ? stats.clicks / stats.impressions : 0,
    })),
    host,
  ));

  const pagesNow = new Map<string, { clicks: number; impressions: number }>();
  const pagesPrev = new Map<string, { clicks: number; impressions: number }>();
  for (const row of gscPagesNow) {
    const key = pageKey(row.page, host) || row.page;
    const current = pagesNow.get(key) ?? { clicks: 0, impressions: 0 };
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    pagesNow.set(key, current);
  }
  for (const row of gscPagesPrev) {
    const key = pageKey(row.page, host) || row.page;
    const current = pagesPrev.get(key) ?? { clicks: 0, impressions: 0 };
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    pagesPrev.set(key, current);
  }
  const sessionsNow = new Map<string, number>();
  const sessionsPrev = new Map<string, number>();
  for (const row of ga4Now) {
    const key = pageKey(row.landingPage, host) || row.landingPage;
    sessionsNow.set(key, (sessionsNow.get(key) ?? 0) + row.sessions);
  }
  for (const row of ga4Prev) {
    const key = pageKey(row.landingPage, host) || row.landingPage;
    sessionsPrev.set(key, (sessionsPrev.get(key) ?? 0) + row.sessions);
  }
  drafts.push(...detectDecay(
    [...pagesNow.entries()].map(([url, now]) => {
      const prev = pagesPrev.get(url) ?? { clicks: 0, impressions: 0 };
      return {
        url,
        clicksNow: now.clicks,
        clicksPrev: prev.clicks,
        impressionsNow: now.impressions,
        impressionsPrev: prev.impressions,
        sessionsNow: sessionsNow.get(url) ?? 0,
        sessionsPrev: sessionsPrev.get(url) ?? 0,
      };
    }),
    host,
  ));

  const byQuery = new Map<string, Map<string, { days: number; impressions: number; clicks: number }>>();
  for (const row of queryPages) {
    const q = byQuery.get(row.query) ?? new Map();
    const page = q.get(row.page) ?? { days: 0, impressions: 0, clicks: 0 };
    page.days += 1;
    page.impressions += row.impressions;
    page.clicks += row.clicks;
    q.set(row.page, page);
    byQuery.set(row.query, q);
  }
  drafts.push(...detectCannibalization(
    [...byQuery.entries()].map(([query, pages]) => ({
      query,
      pages: [...pages.entries()].map(([page, stats]) => ({ page, ...stats })),
    })),
    host,
  ));

  const confirmed = project.competitors.map((item) => item.domain);
  const gaps: Array<{ keyword: string; competitor: string; competitorPosition: number; ours: number | null }> = [];
  for (const snapshot of snapshots) {
    const ours = snapshot.results.find((item) => item.isOwn)?.position ?? snapshot.seoKeyword.currentPosition ?? null;
    for (const result of snapshot.results) {
      if (!confirmed.includes(result.domain)) continue;
      gaps.push({ keyword: snapshot.seoKeyword.keyword, competitor: result.domain, competitorPosition: result.position, ours });
    }
  }
  drafts.push(...detectKeywordGaps(gaps));

  if (latestCrawl) {
    const clickMap = new Map([...pagesNow.entries()].map(([key, stats]) => [key, stats.clicks]));
    drafts.push(...detectTechnicalHighTraffic(
      latestCrawl.issues.map((issue) => ({
        url: issue.url || issue.normalizedUrl || "",
        clicks: clickMap.get(pageKey(issue.url || issue.normalizedUrl, host) || "") ?? 0,
        severity: issue.severity,
        ruleKey: issue.ruleKey,
      })),
      host,
    ));
  }

  drafts.push(...detectTargetMismatch(
    project.keywords.filter((item) => targetUrlMismatch(item.currentUrl, item.targetUrl, host) && item.currentUrl && item.targetUrl).map((item) => ({
      keyword: item.keyword,
      targetUrl: item.targetUrl!,
      rankedUrl: item.currentUrl!,
      position: item.currentPosition,
    })),
    host,
  ));

  const unique = new Map<string, OpportunityDraft>();
  for (const draft of drafts) unique.set(draft.identityKey, draft);
  const incoming = [...unique.values()];
  const existing = await prisma.seoOpportunity.findMany({ where: { seoProjectId } });
  const incomingKeys = new Set(incoming.map((item) => item.identityKey));

  for (const draft of incoming) {
    const current = existing.find((item) => item.identityKey === draft.identityKey);
    if (current?.status === "IGNORED") continue;
    await prisma.seoOpportunity.upsert({
      where: { seoProjectId_identityKey: { seoProjectId, identityKey: draft.identityKey } },
      update: {
        title: draft.title,
        summary: draft.summary,
        url: draft.url ?? null,
        pageKey: draft.pageKey ?? null,
        keyword: draft.keyword ?? null,
        score: draft.score,
        confidence: draft.confidence,
        evidence: draft.evidence as Prisma.InputJsonValue,
        recommendation: draft.recommendation,
        lastDetectedAt: new Date(),
        status: current?.status === "RESOLVED" ? "OPEN" : current?.status ?? "OPEN",
        resolvedAt: null,
      },
      create: {
        seoProjectId,
        type: draft.type,
        identityKey: draft.identityKey,
        title: draft.title,
        summary: draft.summary,
        url: draft.url ?? null,
        pageKey: draft.pageKey ?? null,
        keyword: draft.keyword ?? null,
        score: draft.score,
        confidence: draft.confidence,
        evidence: draft.evidence as Prisma.InputJsonValue,
        recommendation: draft.recommendation,
        status: "OPEN",
      },
    });
  }

  for (const row of existing) {
    if (!incomingKeys.has(row.identityKey) && (row.status === "OPEN" || row.status === "ACKNOWLEDGED")) {
      await prisma.seoOpportunity.update({
        where: { id: row.id },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
    }
  }

  logEvent("info", "seo.opportunities.analyze", { seoProjectId, count: incoming.length });
  return { ok: true, count: incoming.length };
}
