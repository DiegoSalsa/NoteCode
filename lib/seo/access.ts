import { prisma } from "@/lib/prisma";
import { loadProjectPeriodMetrics } from "@/lib/seo/metrics";
import { resolvePeriod } from "@/lib/seo/dates";

/**
 * Structured read model for a future SEO assistant.
 * Never includes OAuth tokens or ciphertext.
 */
export async function getSeoProjectContext(projectId: string, range = "28d") {
  const seoProject = await prisma.seoProject.findUnique({
    where: { projectId },
    include: {
      project: { select: { id: true, name: true, status: true, client: { select: { name: true } } } },
      gscProperty: { select: { displayName: true, siteUrl: true, hostname: true } },
      ga4Property: { select: { displayName: true, externalId: true } },
    },
  });
  if (!seoProject) return null;
  const period = resolvePeriod(range);
  const metrics = await loadProjectPeriodMetrics(seoProject.id, period);
  return {
    project: seoProject.project,
    domain: seoProject.primaryDomain,
    integrations: {
      gsc: seoProject.gscProperty,
      ga4: seoProject.ga4Property,
      lastGscSyncAt: seoProject.lastGscSyncAt,
      lastGa4SyncAt: seoProject.lastGa4SyncAt,
      lastGscSyncStatus: seoProject.lastGscSyncStatus,
      lastGa4SyncStatus: seoProject.lastGa4SyncStatus,
    },
    metrics,
  };
}
