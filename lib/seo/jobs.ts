import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/log";
import { formatDateUTC, utcToday } from "@/lib/seo/dates";
import { isGoogleConfigured, isSeoAuditEnabled, isSeoSyncEnabled, isSerpProviderConfigured, seoAuditIntervalDays, seoDiscoverStaleMs, seoSyncStaleMs } from "@/lib/seo/config";
import { getActiveGoogleConnection } from "@/lib/seo/google-client";
import { seoSchedulerKey, shouldSkipScheduledRun, type SeoScheduleTrigger } from "@/lib/seo/scheduler";
import { beginJob, finishJob, syncDiscovery, syncSeoProject } from "@/lib/seo/sync";
import { syncProjectRankings } from "@/lib/seo/rankings";
import { processCrawlBatch, startProjectCrawl } from "@/lib/seo/crawler";
import { analyzeProjectOpportunities } from "@/lib/seo/analyze-opportunities";

export async function claimSeoSchedule(trigger: SeoScheduleTrigger) {
  const day = formatDateUTC(utcToday());
  const key = seoSchedulerKey(day);
  const existing = await prisma.seoSyncJob.findUnique({ where: { idempotencyKey: key } });
  const decision = shouldSkipScheduledRun({
    existing: existing ? { status: existing.status, startedAt: existing.startedAt, createdAt: existing.createdAt } : null,
    trigger,
  });
  if (decision.skip) return { skip: true as const, reason: decision.reason, job: existing };
  const started = await beginJob({
    type: "scheduler",
    trigger,
    idempotencyKey: key,
    force: trigger === "manual",
  });
  return { skip: started.skip, reason: started.skip ? "already-running" : undefined, job: started.job };
}

export async function runDueSeoJobs(trigger: "cron" | "manual" = "cron") {
  if (!isSeoSyncEnabled()) {
    return { ok: true, skipped: true, reason: "SEO_SYNC_ENABLED=false" };
  }

  const lease = await claimSeoSchedule(trigger);
  if (lease.skip) {
    logEvent("info", "seo.jobs.skipped_duplicate", { trigger, reason: lease.reason });
    return { ok: true, skipped: true, reason: lease.reason };
  }

  const started = Date.now();
  let discovery: { ok: boolean; skipped?: boolean } = { ok: true, skipped: true };
  const googleResults: Array<{ seoProjectId: string; ok: boolean }> = [];

  if (isGoogleConfigured()) {
    const connection = await getActiveGoogleConnection();
    if (connection && connection.status !== "disconnected" && connection.status !== "revoked" && connection.status !== "expired") {
      const discoverStale = !connection.lastDiscoveredAt || Date.now() - connection.lastDiscoveredAt.getTime() > seoDiscoverStaleMs();
      discovery = discoverStale ? await syncDiscovery(trigger) : { ok: true, skipped: true };
      const projects = await prisma.seoProject.findMany({
        where: {
          enabled: true,
          project: { deletedAt: null, visibility: "COMPANY" },
          OR: [{ gscPropertyId: { not: null } }, { ga4PropertyId: { not: null } }],
        },
        select: { id: true, lastGscSyncAt: true, lastGa4SyncAt: true, gscPropertyId: true, ga4PropertyId: true },
      });
      const staleMs = seoSyncStaleMs();
      for (const project of projects) {
        const sources: Array<"gsc" | "ga4"> = [];
        if (project.gscPropertyId && (!project.lastGscSyncAt || Date.now() - project.lastGscSyncAt.getTime() > staleMs)) sources.push("gsc");
        if (project.ga4PropertyId && (!project.lastGa4SyncAt || Date.now() - project.lastGa4SyncAt.getTime() > staleMs)) sources.push("ga4");
        if (!sources.length) continue;
        const result = await syncSeoProject(project.id, trigger, { sources });
        googleResults.push({ seoProjectId: project.id, ok: result.ok });
      }
    }
  }

  const rankingResults = [];
  if (isSerpProviderConfigured()) {
    const rankingProjects = await prisma.seoProject.findMany({
      where: {
        enabled: true,
        project: { deletedAt: null, visibility: "COMPANY" },
        keywords: { some: { active: true } },
      },
      select: { id: true, lastRankingsSyncAt: true },
    });
    const staleMs = seoSyncStaleMs();
    for (const project of rankingProjects) {
      if (project.lastRankingsSyncAt && Date.now() - project.lastRankingsSyncAt.getTime() <= staleMs && trigger === "cron") {
        continue;
      }
      const result = await syncProjectRankings(project.id, trigger);
      rankingResults.push({ seoProjectId: project.id, ok: result.ok, stats: result.stats, error: result.error });
      if (result.status === "budget_exceeded") break;
    }
  }

  const auditResults = [];
  if (isSeoAuditEnabled()) {
    const running = await prisma.seoCrawl.findMany({ where: { status: { in: ["queued", "running"] } }, take: 2, orderBy: { createdAt: "asc" } });
    for (const crawl of running) {
      const result = await processCrawlBatch(crawl.id);
      auditResults.push({ crawlId: crawl.id, status: result?.status });
    }
    if (!running.length) {
      const intervalMs = seoAuditIntervalDays() * 86_400_000;
      const due = await prisma.seoProject.findMany({
        where: {
          enabled: true,
          crawlEnabled: true,
          project: { deletedAt: null, visibility: "COMPANY" },
          OR: [{ lastAuditAt: null }, { lastAuditAt: { lt: new Date(Date.now() - intervalMs) } }],
        },
        take: 1,
      });
      for (const project of due) {
        try {
          const crawl = await startProjectCrawl(project.id, "cron");
          const result = await processCrawlBatch(crawl.id);
          auditResults.push({ crawlId: crawl.id, status: result?.status });
        } catch (error) {
          logEvent("error", "seo.audit.start_failed", { seoProjectId: project.id, message: error instanceof Error ? error.message : "audit failed" });
        }
      }
    }
  }

  const opportunityResults = [];
  const opportunityProjects = await prisma.seoProject.findMany({
    where: { enabled: true, project: { deletedAt: null, visibility: "COMPANY" } },
    select: { id: true },
  });
  for (const project of opportunityProjects) {
    try {
      const result = await analyzeProjectOpportunities(project.id);
      opportunityResults.push({ seoProjectId: project.id, ...result });
    } catch (error) {
      logEvent("error", "seo.opportunities.failed", { seoProjectId: project.id, message: error instanceof Error ? error.message : "analyze failed" });
    }
  }

  if (lease.job) {
    await finishJob(lease.job.id, "success", googleResults.length + rankingResults.length + auditResults.length + opportunityResults.length);
  }

  logEvent("info", "seo.jobs.run", {
    trigger,
    google: googleResults.length,
    rankings: rankingResults.length,
    audits: auditResults.length,
    opportunities: opportunityResults.length,
    duration: Date.now() - started,
    status: "success",
  });

  return {
    ok: true,
    discovery,
    synced: googleResults.length,
    rankings: rankingResults.length,
    rankingResults,
    auditResults,
    opportunityResults,
    results: googleResults,
    durationMs: Date.now() - started,
  };
}
