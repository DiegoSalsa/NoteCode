import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/log";
import { addUtcDays, formatDateUTC, gscSafeEndDate, utcToday } from "@/lib/seo/dates";
import { seoDetailHistoryDays, seoHistoryDays, seoIncrementalLookbackDays } from "@/lib/seo/config";
import { getActiveGoogleConnection } from "@/lib/seo/google-client";
import { discoverGoogleProperties } from "@/lib/seo/discover";
import { gscErrorMessage, syncGscRange } from "@/lib/seo/gsc";
import { ga4ErrorMessage, syncGa4Range } from "@/lib/seo/ga4";

export type SeoSyncTrigger = "manual" | "cron";

function jobKey(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(":");
}

async function beginJob(input: {
  type: string;
  trigger: SeoSyncTrigger;
  connectionId?: string | null;
  seoProjectId?: string | null;
  dateFrom?: string;
  dateTo?: string;
  idempotencyKey: string;
  force?: boolean;
}) {
  const existing = await prisma.seoSyncJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing && !input.force) {
    if (existing.status === "running" && existing.startedAt && Date.now() - existing.startedAt.getTime() < 30 * 60_000) {
      return { skip: true as const, job: existing, reason: "already-running" };
    }
    if (existing.status === "success" && Date.now() - existing.createdAt.getTime() < 6 * 3600_000) {
      return { skip: true as const, job: existing, reason: "already-succeeded" };
    }
  }

  const job = existing
    ? await prisma.seoSyncJob.update({
        where: { id: existing.id },
        data: {
          status: "running",
          trigger: input.trigger,
          startedAt: new Date(),
          finishedAt: null,
          error: null,
          recordsProcessed: 0,
        },
      })
    : await prisma.seoSyncJob.create({
        data: {
          type: input.type,
          trigger: input.trigger,
          connectionId: input.connectionId ?? null,
          seoProjectId: input.seoProjectId ?? null,
          dateFrom: input.dateFrom ? new Date(`${input.dateFrom}T00:00:00.000Z`) : null,
          dateTo: input.dateTo ? new Date(`${input.dateTo}T00:00:00.000Z`) : null,
          status: "running",
          startedAt: new Date(),
          idempotencyKey: input.idempotencyKey,
        },
      });

  return { skip: false as const, job };
}

async function finishJob(jobId: string, status: "success" | "error", recordsProcessed: number, error?: string) {
  const job = await prisma.seoSyncJob.findUnique({ where: { id: jobId } });
  const finishedAt = new Date();
  const durationMs = job?.startedAt ? finishedAt.getTime() - job.startedAt.getTime() : null;
  return prisma.seoSyncJob.update({
    where: { id: jobId },
    data: { status, recordsProcessed, error: error ?? null, finishedAt, durationMs },
  });
}

export async function syncDiscovery(trigger: SeoSyncTrigger, force = false) {
  const connection = await getActiveGoogleConnection();
  if (!connection) return { ok: false, error: "No hay una cuenta de Google conectada." };
  const day = formatDateUTC(utcToday());
  const started = await beginJob({
    type: "discover",
    trigger,
    connectionId: connection.id,
    idempotencyKey: jobKey(["discover", connection.id, day]),
    force,
  });
  if (started.skip) return { ok: true, skipped: true, job: started.job };
  try {
    const properties = await discoverGoogleProperties(connection);
    const job = await finishJob(started.job.id, "success", properties.length);
    return { ok: true, job, count: properties.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudieron descubrir propiedades.";
    const job = await finishJob(started.job.id, "error", 0, message);
    logEvent("error", "seo.discover.failed", { connectionId: connection.id });
    return { ok: false, job, error: message };
  }
}

export async function syncSeoProject(
  seoProjectId: string,
  trigger: SeoSyncTrigger,
  options: { force?: boolean; full?: boolean; sources?: Array<"gsc" | "ga4"> } = {},
) {
  const connection = await getActiveGoogleConnection();
  if (!connection) return { ok: false, error: "No hay una cuenta de Google conectada." };

  const seoProject = await prisma.seoProject.findUnique({
    where: { id: seoProjectId },
    include: { gscProperty: true, ga4Property: true, project: { select: { name: true } } },
  });
  if (!seoProject) return { ok: false, error: "El proyecto SEO no existe." };

  const sources = options.sources ?? ["gsc", "ga4"];
  const hasGscHistory = await prisma.seoGscSiteDaily.findFirst({ where: { seoProjectId }, select: { id: true } });
  const hasGa4History = await prisma.seoGa4SiteDaily.findFirst({ where: { seoProjectId }, select: { id: true } });
  const end = formatDateUTC(gscSafeEndDate());
  const full = Boolean(options.full || (!hasGscHistory && sources.includes("gsc")) || (!hasGa4History && sources.includes("ga4")));
  const lookback = full ? seoHistoryDays() : seoIncrementalLookbackDays();
  const detailDays = full ? Math.max(seoDetailHistoryDays(), 28) : seoIncrementalLookbackDays();
  const siteFrom = formatDateUTC(addUtcDays(gscSafeEndDate(), -(lookback - 1)));
  const detailFrom = formatDateUTC(addUtcDays(gscSafeEndDate(), -(detailDays - 1)));
  const results: Array<{ source: string; ok: boolean; records: number; error?: string }> = [];

  if (sources.includes("gsc") && seoProject.gscProperty?.siteUrl) {
    const started = await beginJob({
      type: "gsc",
      trigger,
      connectionId: connection.id,
      seoProjectId,
      dateFrom: siteFrom,
      dateTo: end,
      idempotencyKey: jobKey(["gsc", seoProjectId, siteFrom, end, full ? "full" : "inc"]),
      force: options.force,
    });
    if (started.skip) {
      results.push({ source: "gsc", ok: true, records: started.job.recordsProcessed });
    } else {
      try {
        let records = await syncGscRange(
          connection,
          seoProjectId,
          seoProject.gscProperty.siteUrl,
          siteFrom,
          end,
          !full,
        );
        if (full) {
          records += await syncGscRange(
            connection,
            seoProjectId,
            seoProject.gscProperty.siteUrl,
            detailFrom,
            end,
            true,
          );
        }
        await prisma.seoProject.update({
          where: { id: seoProjectId },
          data: { lastGscSyncAt: new Date(), lastGscSyncStatus: "success", lastGscError: null },
        });
        await finishJob(started.job.id, "success", records);
        results.push({ source: "gsc", ok: true, records });
      } catch (error) {
        const message = gscErrorMessage(error);
        await prisma.seoProject.update({
          where: { id: seoProjectId },
          data: { lastGscSyncAt: new Date(), lastGscSyncStatus: "error", lastGscError: message },
        });
        await finishJob(started.job.id, "error", 0, message);
        logEvent("error", "seo.gsc.sync_failed", { seoProjectId, project: seoProject.project.name });
        results.push({ source: "gsc", ok: false, records: 0, error: message });
      }
    }
  } else if (sources.includes("gsc")) {
    results.push({ source: "gsc", ok: false, records: 0, error: "El proyecto no tiene Search Console vinculado." });
  }

  if (sources.includes("ga4") && seoProject.ga4Property?.externalId) {
    const started = await beginJob({
      type: "ga4",
      trigger,
      connectionId: connection.id,
      seoProjectId,
      dateFrom: siteFrom,
      dateTo: end,
      idempotencyKey: jobKey(["ga4", seoProjectId, siteFrom, end, full ? "full" : "inc"]),
      force: options.force,
    });
    if (started.skip) {
      results.push({ source: "ga4", ok: true, records: started.job.recordsProcessed });
    } else {
      try {
        let records = await syncGa4Range(
          connection,
          seoProjectId,
          seoProject.ga4Property.externalId,
          siteFrom,
          end,
          !full,
        );
        if (full) {
          records += await syncGa4Range(
            connection,
            seoProjectId,
            seoProject.ga4Property.externalId,
            detailFrom,
            end,
            true,
          );
        }
        await prisma.seoProject.update({
          where: { id: seoProjectId },
          data: { lastGa4SyncAt: new Date(), lastGa4SyncStatus: "success", lastGa4Error: null },
        });
        await finishJob(started.job.id, "success", records);
        results.push({ source: "ga4", ok: true, records });
      } catch (error) {
        const message = ga4ErrorMessage(error);
        await prisma.seoProject.update({
          where: { id: seoProjectId },
          data: { lastGa4SyncAt: new Date(), lastGa4SyncStatus: "error", lastGa4Error: message },
        });
        await finishJob(started.job.id, "error", 0, message);
        logEvent("error", "seo.ga4.sync_failed", { seoProjectId, project: seoProject.project.name });
        results.push({ source: "ga4", ok: false, records: 0, error: message });
      }
    }
  } else if (sources.includes("ga4")) {
    results.push({ source: "ga4", ok: false, records: 0, error: "El proyecto no tiene Analytics vinculado." });
  }

  const ok = results.some((item) => item.ok);
  return { ok, results };
}

export { makeSyncIdempotencyKey } from "@/lib/seo/aggregates";
