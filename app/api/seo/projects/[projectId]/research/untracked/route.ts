import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addUtcDays, utcToday } from "@/lib/seo/dates";
import { normalizeKeyword } from "@/lib/seo/domain";
import { canViewSeo } from "@/lib/seo/permissions";
import { loadCompanySeoProject } from "@/lib/seo/project-access";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { projectId } = await params;
    const loaded = await loadCompanySeoProject(projectId, user.id);
    if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado." }, { status: 404 });
    const from = addUtcDays(utcToday(), -27);
    const [queries, tracked] = await Promise.all([
      prisma.seoGscQueryDaily.findMany({ where: { seoProjectId: loaded.seoProject.id, date: { gte: from } } }),
      prisma.seoKeyword.findMany({ where: { seoProjectId: loaded.seoProject.id }, select: { normalizedKeyword: true } }),
    ]);
    const trackedSet = new Set(tracked.map((item) => item.normalizedKeyword));
    const agg = new Map<string, { clicks: number; impressions: number; posW: number }>();
    for (const row of queries) {
      const key = normalizeKeyword(row.query);
      if (trackedSet.has(key)) continue;
      const current = agg.get(key) ?? { clicks: 0, impressions: 0, posW: 0 };
      current.clicks += row.clicks;
      current.impressions += row.impressions;
      current.posW += row.position * row.impressions;
      agg.set(row.query, current);
    }
    const rows = [...agg.entries()]
      .map(([keyword, stats]) => ({
        keyword,
        clicks: stats.clicks,
        impressions: stats.impressions,
        ctr: stats.impressions > 0 ? stats.clicks / stats.impressions : 0,
        position: stats.impressions > 0 ? stats.posW / stats.impressions : null,
      }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 100);
    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron cargar queries." }, { status: 500 });
  }
}
