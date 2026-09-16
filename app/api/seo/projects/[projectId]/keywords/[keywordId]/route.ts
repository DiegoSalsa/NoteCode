import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePeriod } from "@/lib/seo/dates";
import { targetUrlMismatch } from "@/lib/seo/domain";
import { isUniqueKeywordError, keywordStatus, normalizeKeywordInput, resolveKeywordGroup } from "@/lib/seo/keywords";
import { canManageSeo, canViewSeo } from "@/lib/seo/permissions";
import { loadCompanySeoProject } from "@/lib/seo/project-access";
import { rankingEvents } from "@/lib/seo/rank-events";
import { summarizeGsc } from "@/lib/seo/aggregates";

type Params = { params: Promise<{ projectId: string; keywordId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { projectId, keywordId } = await params;
  const loaded = await loadCompanySeoProject(projectId, user.id);
  if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado en este proyecto." }, { status: 404 });

  const keyword = await prisma.seoKeyword.findFirst({
    where: { id: keywordId, seoProjectId: loaded.seoProject.id },
    include: { group: true },
  });
  if (!keyword) return NextResponse.json({ error: "Keyword no encontrada." }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const period = resolvePeriod(searchParams.get("range") || "3m");
  const rankings = await prisma.seoRanking.findMany({
    where: {
      seoKeywordId: keyword.id,
      date: { gte: new Date(`${period.from}T00:00:00.000Z`), lte: new Date(`${period.to}T00:00:00.000Z`) },
    },
    orderBy: { date: "asc" },
  });
  const latestSnapshot = await prisma.seoSerpSnapshot.findFirst({
    where: { seoKeywordId: keyword.id },
    orderBy: { date: "desc" },
    include: { results: { orderBy: { position: "asc" }, take: 20 } },
  });

  const gscRows = await prisma.seoGscQueryDaily.findMany({
    where: {
      seoProjectId: loaded.seoProject.id,
      query: keyword.keyword,
      date: { gte: new Date(`${period.from}T00:00:00.000Z`), lte: new Date(`${period.to}T00:00:00.000Z`) },
    },
  });
  const gsc = summarizeGsc(gscRows);

  const series = rankings.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    position: row.position,
    url: row.url,
  }));

  return NextResponse.json({
    keyword: {
      ...keyword,
      status: keywordStatus(keyword),
      targetMismatch: targetUrlMismatch(keyword.currentUrl, keyword.targetUrl, loaded.seoProject.primaryDomain),
    },
    primaryDomain: loaded.seoProject.primaryDomain,
    series,
    events: rankingEvents(series),
    snapshot: latestSnapshot,
    trackedSerpPosition: keyword.currentPosition,
    gscAveragePosition: gsc.impressions > 0 ? gsc.position : null,
    gscClicks: gsc.clicks,
    gscImpressions: gsc.impressions,
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageSeo(user)) return NextResponse.json({ error: "Sin permisos para administrar keywords." }, { status: 403 });
  const { projectId, keywordId } = await params;
  const loaded = await loadCompanySeoProject(projectId, user.id);
  if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado en este proyecto." }, { status: 404 });
  const current = await prisma.seoKeyword.findFirst({ where: { id: keywordId, seoProjectId: loaded.seoProject.id } });
  if (!current) return NextResponse.json({ error: "Keyword no encontrada." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  let input;
  try {
    input = normalizeKeywordInput({
      keyword: body.keyword ?? current.keyword,
      targetUrl: body.targetUrl === undefined ? current.targetUrl : body.targetUrl,
      country: body.country ?? current.country,
      language: body.language ?? current.language,
      device: body.device ?? current.device,
      location: body.location === undefined ? current.location : body.location,
      group: body.group,
      active: body.active ?? current.active,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Datos inválidos" }, { status: 400 });
  }
  const group = body.group === undefined ? undefined : await resolveKeywordGroup(loaded.seoProject.id, input.groupName);
  try {
    const keyword = await prisma.seoKeyword.update({
      where: { id: current.id },
      data: {
        keyword: input.keyword,
        normalizedKeyword: input.normalizedKeyword,
        targetUrl: input.targetUrl,
        country: input.country,
        language: input.language,
        device: input.device,
        location: input.location,
        active: input.active,
        lastSyncStatus: input.active ? (current.lastSyncStatus === "inactive" ? "pending" : current.lastSyncStatus) : "inactive",
        ...(group !== undefined ? { groupId: group?.id ?? null } : {}),
      },
    });
    return NextResponse.json({ success: true, keyword });
  } catch (error) {
    if (isUniqueKeywordError(error)) {
      return NextResponse.json({ error: "Ya existe esa keyword para el mismo país, idioma, dispositivo y ubicación." }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageSeo(user)) return NextResponse.json({ error: "Sin permisos para administrar keywords." }, { status: 403 });
  const { projectId, keywordId } = await params;
  const loaded = await loadCompanySeoProject(projectId, user.id);
  if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado en este proyecto." }, { status: 404 });
  await prisma.seoKeyword.deleteMany({ where: { id: keywordId, seoProjectId: loaded.seoProject.id } });
  return NextResponse.json({ success: true });
}
