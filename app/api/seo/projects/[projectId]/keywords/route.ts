import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addUtcDays, utcToday } from "@/lib/seo/dates";
import { isUniqueKeywordError, keywordStatus, normalizeKeywordInput, resolveKeywordGroup } from "@/lib/seo/keywords";
import { canManageSeo, canViewSeo } from "@/lib/seo/permissions";
import { loadCompanySeoProject } from "@/lib/seo/project-access";
import { targetUrlMismatch } from "@/lib/seo/domain";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { projectId } = await params;
  const loaded = await loadCompanySeoProject(projectId, user.id);
  if (!loaded) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  if (!loaded.seoProject) return NextResponse.json({ error: "SEO no habilitado en este proyecto." }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const groupId = searchParams.get("groupId") || "";
  const status = searchParams.get("status") || "";
  const today = utcToday();
  const day7 = addUtcDays(today, -7);
  const day28 = addUtcDays(today, -28);

  const keywords = await prisma.seoKeyword.findMany({
    where: {
      seoProjectId: loaded.seoProject.id,
      ...(q ? { keyword: { contains: q, mode: "insensitive" } } : {}),
      ...(groupId ? { groupId } : {}),
    },
    include: { group: { select: { id: true, name: true } } },
    orderBy: [{ active: "desc" }, { keyword: "asc" }],
  });

  const history = await prisma.seoRanking.findMany({
    where: {
      seoKeywordId: { in: keywords.map((item) => item.id) },
      date: { in: [day7, day28] },
    },
    select: { seoKeywordId: true, date: true, position: true },
  });
  const historyMap = new Map(history.map((row) => [`${row.seoKeywordId}:${row.date.toISOString().slice(0, 10)}`, row.position]));

  const rows = keywords
    .map((keyword) => {
      const itemStatus = keywordStatus(keyword);
      return {
        id: keyword.id,
        keyword: keyword.keyword,
        targetUrl: keyword.targetUrl,
        country: keyword.country,
        language: keyword.language,
        device: keyword.device,
        location: keyword.location,
        active: keyword.active,
        group: keyword.group,
        searchVolume: keyword.searchVolume,
        position: keyword.currentPosition,
        previous: keyword.previousPosition,
        delta: keyword.currentPosition != null && keyword.previousPosition != null
          ? keyword.currentPosition - keyword.previousPosition
          : null,
        best: keyword.bestPosition,
        url: keyword.currentUrl,
        position7d: historyMap.get(`${keyword.id}:${day7.toISOString().slice(0, 10)}`) ?? null,
        position28d: historyMap.get(`${keyword.id}:${day28.toISOString().slice(0, 10)}`) ?? null,
        targetMismatch: targetUrlMismatch(keyword.currentUrl, keyword.targetUrl, loaded.seoProject?.primaryDomain),
        lastSyncAt: keyword.lastSyncAt,
        lastSyncStatus: keyword.lastSyncStatus,
        lastError: keyword.lastError,
        status: itemStatus,
        features: [] as string[],
      };
    })
    .filter((row) => !status || row.status === status);

  const groups = await prisma.seoKeywordGroup.findMany({
    where: { seoProjectId: loaded.seoProject.id },
    orderBy: { name: "asc" },
  });

  const latestSnapshots = await prisma.seoSerpSnapshot.findMany({
    where: { seoKeywordId: { in: rows.map((row) => row.id) } },
    orderBy: { date: "desc" },
    distinct: ["seoKeywordId"],
    select: { seoKeywordId: true, features: true },
  });
  const featureMap = new Map(latestSnapshots.map((item) => [item.seoKeywordId, item.features]));
  for (const row of rows) row.features = featureMap.get(row.id) ?? [];

  return NextResponse.json({
    project: loaded.seoProject.project,
    primaryDomain: loaded.seoProject.primaryDomain,
    lastRankingsSyncAt: loaded.seoProject.lastRankingsSyncAt,
    lastRankingsSyncStatus: loaded.seoProject.lastRankingsSyncStatus,
    lastRankingsError: loaded.seoProject.lastRankingsError,
    groups,
    rows,
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageSeo(user)) return NextResponse.json({ error: "Sin permisos para administrar keywords." }, { status: 403 });
  const { projectId } = await params;
  const loaded = await loadCompanySeoProject(projectId, user.id);
  if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado en este proyecto." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  let input;
  try {
    input = normalizeKeywordInput(body);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Datos inválidos" }, { status: 400 });
  }
  const group = await resolveKeywordGroup(loaded.seoProject.id, input.groupName);
  try {
    const keyword = await prisma.seoKeyword.create({
      data: {
        seoProjectId: loaded.seoProject.id,
        groupId: group?.id ?? null,
        keyword: input.keyword,
        normalizedKeyword: input.normalizedKeyword,
        targetUrl: input.targetUrl,
        country: input.country,
        language: input.language,
        device: input.device,
        location: input.location,
        active: input.active,
        lastSyncStatus: "pending",
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
