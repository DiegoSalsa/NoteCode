import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { competitorMetrics } from "@/lib/seo/competitors";
import { normalizeDomain } from "@/lib/seo/domain";
import { canManageSeo, canViewSeo } from "@/lib/seo/permissions";
import { loadCompanySeoProject } from "@/lib/seo/project-access";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { projectId } = await params;
  const loaded = await loadCompanySeoProject(projectId, user.id);
  if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado en este proyecto." }, { status: 404 });

  const competitors = await prisma.seoCompetitor.findMany({
    where: { seoProjectId: loaded.seoProject.id, active: true },
    orderBy: { domain: "asc" },
  });
  const snapshots = await prisma.seoSerpSnapshot.findMany({
    where: { seoProjectId: loaded.seoProject.id },
    orderBy: { date: "desc" },
    distinct: ["seoKeywordId"],
    include: { results: { where: { type: { in: ["organic", "featured_snippet"] } }, select: { domain: true, position: true } } },
  });
  const tracked = snapshots.length;

  const rows = competitors.map((competitor) => {
    const positions = snapshots.map((snapshot) => {
      const hit = snapshot.results.find((result) => result.domain === competitor.domain);
      return hit?.position ?? null;
    });
    return { ...competitor, metrics: competitorMetrics(positions, tracked) };
  });

  return NextResponse.json({
    project: loaded.seoProject.project,
    primaryDomain: loaded.seoProject.primaryDomain,
    trackedSerps: tracked,
    rows,
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageSeo(user)) return NextResponse.json({ error: "Sin permisos para administrar competidores." }, { status: 403 });
  const { projectId } = await params;
  const loaded = await loadCompanySeoProject(projectId, user.id);
  if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado en este proyecto." }, { status: 404 });

  const body = await request.json().catch(() => ({})) as { domain?: string; name?: string; source?: string };
  const domain = normalizeDomain(body.domain);
  if (!domain) return NextResponse.json({ error: "Dominio inválido." }, { status: 400 });
  if (loaded.seoProject.primaryDomain && domain === loaded.seoProject.primaryDomain) {
    return NextResponse.json({ error: "No puedes agregar el dominio propio como competidor." }, { status: 400 });
  }

  const competitor = await prisma.seoCompetitor.upsert({
    where: { seoProjectId_domain: { seoProjectId: loaded.seoProject.id, domain } },
    update: { active: true, name: body.name?.trim() || undefined, source: body.source === "detected" ? "detected" : "manual" },
    create: {
      seoProjectId: loaded.seoProject.id,
      domain,
      name: body.name?.trim() || null,
      source: body.source === "detected" ? "detected" : "manual",
    },
  });
  return NextResponse.json({ success: true, competitor });
}
