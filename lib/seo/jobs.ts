import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/log";
import { isGoogleConfigured, isSeoSyncEnabled, seoDiscoverStaleMs, seoSyncStaleMs } from "@/lib/seo/config";
import { getActiveGoogleConnection } from "@/lib/seo/google-client";
import { syncDiscovery, syncSeoProject } from "@/lib/seo/sync";

export async function runDueSeoJobs(trigger: "cron" | "manual" = "cron") {
  if (!isSeoSyncEnabled()) {
    return { ok: true, skipped: true, reason: "SEO_SYNC_ENABLED=false" };
  }
  if (!isGoogleConfigured()) {
    return { ok: false, error: "Integración no configurada" };
  }

  const connection = await getActiveGoogleConnection();
  if (!connection || connection.status === "disconnected") {
    return { ok: true, skipped: true, reason: "disconnected" };
  }
  if (connection.status === "revoked" || connection.status === "expired") {
    logEvent("warn", "seo.jobs.skipped_token", { status: connection.status });
    return { ok: false, error: connection.lastError || "La conexión de Google no está activa." };
  }

  const started = Date.now();
  const discoverStale = !connection.lastDiscoveredAt || Date.now() - connection.lastDiscoveredAt.getTime() > seoDiscoverStaleMs();
  const discovery = discoverStale ? await syncDiscovery(trigger) : { ok: true, skipped: true };

  const projects = await prisma.seoProject.findMany({
    where: {
      enabled: true,
      project: { deletedAt: null, visibility: "COMPANY" },
      OR: [{ gscPropertyId: { not: null } }, { ga4PropertyId: { not: null } }],
    },
    select: {
      id: true,
      lastGscSyncAt: true,
      lastGa4SyncAt: true,
      gscPropertyId: true,
      ga4PropertyId: true,
    },
  });

  const staleMs = seoSyncStaleMs();
  const results = [];
  for (const project of projects) {
    const sources: Array<"gsc" | "ga4"> = [];
    if (project.gscPropertyId && (!project.lastGscSyncAt || Date.now() - project.lastGscSyncAt.getTime() > staleMs)) {
      sources.push("gsc");
    }
    if (project.ga4PropertyId && (!project.lastGa4SyncAt || Date.now() - project.lastGa4SyncAt.getTime() > staleMs)) {
      sources.push("ga4");
    }
    if (!sources.length) continue;
    const result = await syncSeoProject(project.id, trigger, { sources });
    results.push({ seoProjectId: project.id, ...result });
  }

  logEvent("info", "seo.jobs.run", {
    trigger,
    projects: results.length,
    duration: Date.now() - started,
    status: "success",
  });

  return {
    ok: true,
    discovery,
    synced: results.length,
    results,
    durationMs: Date.now() - started,
  };
}
