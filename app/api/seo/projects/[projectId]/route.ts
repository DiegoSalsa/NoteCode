import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { findAccessibleProject } from "@/lib/personal-workspace";
import { resolvePeriod } from "@/lib/seo/dates";
import { extractHostname } from "@/lib/seo/match";
import { loadProjectPeriodMetrics } from "@/lib/seo/metrics";
import { canManageSeo, canViewSeo } from "@/lib/seo/permissions";
import { syncSeoProject } from "@/lib/seo/sync";

type Params = { params: Promise<{ projectId: string }> };

async function loadSeoProject(projectId: string) {
  return prisma.seoProject.findUnique({
    where: { projectId },
    include: {
      project: { select: { id: true, name: true, status: true, visibility: true, client: { select: { id: true, name: true, website: true } } } },
      gscProperty: true,
      ga4Property: true,
    },
  });
}

export async function GET(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { projectId } = await params;
  const project = await findAccessibleProject(projectId, user.id);
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  let period;
  try {
    period = resolvePeriod(searchParams.get("range"), searchParams.get("from"), searchParams.get("to"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Rango inválido" }, { status: 400 });
  }

  const seoProject = await loadSeoProject(projectId);
  const metrics = seoProject ? await loadProjectPeriodMetrics(seoProject.id, period) : null;
  const jobs = seoProject
    ? await prisma.seoSyncJob.findMany({
        where: { seoProjectId: seoProject.id },
        orderBy: { createdAt: "desc" },
        take: 12,
      })
    : [];

  return NextResponse.json({
    project: seoProject?.project ?? (await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, status: true, visibility: true, client: { select: { id: true, name: true, website: true } } },
    })),
    seoProject: seoProject
      ? {
          id: seoProject.id,
          enabled: seoProject.enabled,
          primaryDomain: seoProject.primaryDomain,
          gscProperty: seoProject.gscProperty,
          ga4Property: seoProject.ga4Property,
          lastGscSyncAt: seoProject.lastGscSyncAt,
          lastGa4SyncAt: seoProject.lastGa4SyncAt,
          lastGscSyncStatus: seoProject.lastGscSyncStatus,
          lastGa4SyncStatus: seoProject.lastGa4SyncStatus,
          lastGscError: seoProject.lastGscError,
          lastGa4Error: seoProject.lastGa4Error,
        }
      : null,
    period,
    metrics,
    jobs: jobs.map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      trigger: job.trigger,
      recordsProcessed: job.recordsProcessed,
      error: job.error,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      durationMs: job.durationMs,
    })),
  });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageSeo(user)) return NextResponse.json({ error: "Sin permisos para vincular SEO." }, { status: 403 });
  const { projectId } = await params;
  const project = await findAccessibleProject(projectId, user.id);
  if (!project || project.visibility !== "COMPANY") {
    return NextResponse.json({ error: "Solo se puede habilitar SEO en proyectos de empresa." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({})) as {
    enabled?: boolean;
    gscPropertyId?: string | null;
    ga4PropertyId?: string | null;
    primaryDomain?: string | null;
    sync?: boolean;
    full?: boolean;
  };

  const [gscProperty, ga4Property] = await Promise.all([
    body.gscPropertyId
      ? prisma.seoGoogleProperty.findFirst({ where: { id: body.gscPropertyId, kind: "GSC" } })
      : Promise.resolve(null),
    body.ga4PropertyId
      ? prisma.seoGoogleProperty.findFirst({ where: { id: body.ga4PropertyId, kind: "GA4_PROPERTY" } })
      : Promise.resolve(null),
  ]);

  if (body.gscPropertyId && !gscProperty) {
    return NextResponse.json({ error: "La propiedad de Search Console no existe." }, { status: 400 });
  }
  if (body.ga4PropertyId && !ga4Property) {
    return NextResponse.json({ error: "La propiedad de Analytics no existe." }, { status: 400 });
  }

  const primaryDomain = body.primaryDomain?.trim()
    || extractHostname(gscProperty?.siteUrl)
    || extractHostname(gscProperty?.hostname)
    || null;

  const seoProject = await prisma.seoProject.upsert({
    where: { projectId },
    update: {
      enabled: body.enabled ?? true,
      gscPropertyId: body.gscPropertyId === undefined ? undefined : body.gscPropertyId,
      ga4PropertyId: body.ga4PropertyId === undefined ? undefined : body.ga4PropertyId,
      primaryDomain,
    },
    create: {
      projectId,
      enabled: body.enabled ?? true,
      gscPropertyId: body.gscPropertyId ?? null,
      ga4PropertyId: body.ga4PropertyId ?? null,
      primaryDomain,
    },
    include: { gscProperty: true, ga4Property: true, project: { select: { name: true } } },
  });

  await recordAudit({
    action: "LINK",
    entityType: "SeoProject",
    entityId: seoProject.id,
    summary: `SEO vinculado a ${seoProject.project.name}`,
    metadata: { gscPropertyId: seoProject.gscPropertyId, ga4PropertyId: seoProject.ga4PropertyId },
  });

  let sync = null;
  if (body.sync !== false && (seoProject.gscPropertyId || seoProject.ga4PropertyId)) {
    sync = await syncSeoProject(seoProject.id, "manual", { force: true, full: Boolean(body.full) });
  }

  return NextResponse.json({ success: true, seoProject, sync });
}
