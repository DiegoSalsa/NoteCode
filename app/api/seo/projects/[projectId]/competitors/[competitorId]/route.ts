import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSeo, canViewSeo } from "@/lib/seo/permissions";
import { loadCompanySeoProject } from "@/lib/seo/project-access";

type Params = { params: Promise<{ projectId: string; competitorId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { projectId, competitorId } = await params;
  const loaded = await loadCompanySeoProject(projectId, user.id);
  if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado en este proyecto." }, { status: 404 });

  const competitor = await prisma.seoCompetitor.findFirst({
    where: { id: competitorId, seoProjectId: loaded.seoProject.id },
  });
  if (!competitor) return NextResponse.json({ error: "Competidor no encontrado." }, { status: 404 });

  const keywords = await prisma.seoKeyword.findMany({
    where: { seoProjectId: loaded.seoProject.id, active: true },
    select: { id: true, keyword: true, currentPosition: true, currentUrl: true },
    orderBy: { keyword: "asc" },
  });
  const snapshots = await prisma.seoSerpSnapshot.findMany({
    where: { seoKeywordId: { in: keywords.map((item) => item.id) } },
    orderBy: { date: "desc" },
    distinct: ["seoKeywordId"],
    include: { results: { where: { domain: competitor.domain }, select: { position: true, url: true } } },
  });
  const snapMap = new Map(snapshots.map((item) => [item.seoKeywordId, item.results[0] ?? null]));
  const rows = keywords.map((keyword) => ({
    keywordId: keyword.id,
    keyword: keyword.keyword,
    us: keyword.currentPosition,
    usUrl: keyword.currentUrl,
    them: snapMap.get(keyword.id)?.position ?? null,
    themUrl: snapMap.get(keyword.id)?.url ?? null,
  }));

  return NextResponse.json({ competitor, rows });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageSeo(user)) return NextResponse.json({ error: "Sin permisos para administrar competidores." }, { status: 403 });
  const { projectId, competitorId } = await params;
  const loaded = await loadCompanySeoProject(projectId, user.id);
  if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado en este proyecto." }, { status: 404 });
  await prisma.seoCompetitor.deleteMany({ where: { id: competitorId, seoProjectId: loaded.seoProject.id } });
  return NextResponse.json({ success: true });
}
