import { prisma } from "@/lib/prisma";
import { type SeoPeriod } from "@/lib/seo/dates";
import { summarizeGa4, summarizeGsc, withDelta } from "@/lib/seo/aggregates";

export { summarizeGa4, summarizeGsc, withDelta } from "@/lib/seo/aggregates";

function rangeWhere(from: string, to: string) {
  return {
    gte: new Date(`${from}T00:00:00.000Z`),
    lte: new Date(`${to}T00:00:00.000Z`),
  };
}

export async function loadProjectPeriodMetrics(seoProjectId: string, period: SeoPeriod) {
  const dateCurrent = rangeWhere(period.from, period.to);
  const datePrevious = rangeWhere(period.previousFrom, period.previousTo);

  const [gscCurrent, gscPrevious, ga4Current, ga4Previous] = await Promise.all([
    prisma.seoGscSiteDaily.findMany({ where: { seoProjectId, date: dateCurrent }, orderBy: { date: "asc" } }),
    prisma.seoGscSiteDaily.findMany({ where: { seoProjectId, date: datePrevious } }),
    prisma.seoGa4SiteDaily.findMany({ where: { seoProjectId, date: dateCurrent }, orderBy: { date: "asc" } }),
    prisma.seoGa4SiteDaily.findMany({ where: { seoProjectId, date: datePrevious } }),
  ]);

  const gsc = withDelta(summarizeGsc(gscCurrent), summarizeGsc(gscPrevious));
  const ga4 = withDelta(summarizeGa4(ga4Current), summarizeGa4(ga4Previous));

  return {
    period,
    gsc,
    ga4,
    series: {
      gsc: gscCurrent.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      })),
      ga4: ga4Current.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        users: row.users,
        sessions: row.sessions,
        organicSessions: row.organicSessions,
        keyEvents: row.keyEvents,
      })),
    },
  };
}

export async function loadPortfolioMetrics(period: SeoPeriod) {
  const seoProjects = await prisma.seoProject.findMany({
    where: { project: { deletedAt: null, visibility: "COMPANY" } },
    include: {
      project: { select: { id: true, name: true, status: true, client: { select: { id: true, name: true } } } },
      gscProperty: { select: { id: true, displayName: true, siteUrl: true, hostname: true } },
      ga4Property: { select: { id: true, displayName: true, externalId: true } },
    },
    orderBy: { project: { name: "asc" } },
  });

  const items = [];
  for (const seoProject of seoProjects) {
    const metrics = await loadProjectPeriodMetrics(seoProject.id, period);
    items.push({
      id: seoProject.id,
      projectId: seoProject.projectId,
      name: seoProject.project.name,
      status: seoProject.project.status,
      client: seoProject.project.client,
      enabled: seoProject.enabled,
      primaryDomain: seoProject.primaryDomain,
      gsc: seoProject.gscProperty,
      ga4: seoProject.ga4Property,
      lastGscSyncAt: seoProject.lastGscSyncAt,
      lastGa4SyncAt: seoProject.lastGa4SyncAt,
      lastGscSyncStatus: seoProject.lastGscSyncStatus,
      lastGa4SyncStatus: seoProject.lastGa4SyncStatus,
      lastGscError: seoProject.lastGscError,
      lastGa4Error: seoProject.lastGa4Error,
      metrics,
    });
  }
  return items;
}
