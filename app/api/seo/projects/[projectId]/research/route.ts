import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSeo, canViewSeo } from "@/lib/seo/permissions";
import { loadCompanySeoProject } from "@/lib/seo/project-access";
import { researchKeyword } from "@/lib/seo/research-cache";
import { estimateResearchCostUsd, KeywordResearchNotConfiguredError } from "@/lib/seo/providers/research";
import { normalizeKeyword } from "@/lib/seo/domain";
import { addUtcDays, utcToday } from "@/lib/seo/dates";
import { BudgetExceededError } from "@/lib/seo/budget";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { projectId } = await params;
    const loaded = await loadCompanySeoProject(projectId, user.id);
    if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado." }, { status: 404 });
    const keyword = request.nextUrl.searchParams.get("q")?.trim() || "";
    const country = (request.nextUrl.searchParams.get("country") || "CL").toUpperCase();
    const language = (request.nextUrl.searchParams.get("language") || "es").toLowerCase();
    if (!keyword) return NextResponse.json({ error: "Indica una keyword." }, { status: 400 });

    const tracked = await prisma.seoKeyword.findMany({
      where: { seoProjectId: loaded.seoProject.id },
      select: { keyword: true, normalizedKeyword: true, currentPosition: true },
    });
    const trackedSet = new Set(tracked.map((item) => item.normalizedKeyword));
    const from = addUtcDays(utcToday(), -27);
    const gsc = await prisma.seoGscQueryDaily.findMany({
      where: { seoProjectId: loaded.seoProject.id, query: { equals: keyword, mode: "insensitive" }, date: { gte: from } },
    });
    const gscAgg = gsc.reduce((acc, row) => {
      acc.clicks += row.clicks;
      acc.impressions += row.impressions;
      acc.posW += row.position * row.impressions;
      return acc;
    }, { clicks: 0, impressions: 0, posW: 0 });

    const include = request.nextUrl.searchParams.get("expand") !== "0";
    const estimatedCostUsd = include ? 3 * estimateResearchCostUsd(20) : estimateResearchCostUsd(1);
    const confirm = request.nextUrl.searchParams.get("confirm") === "1";
    if (include && !confirm && canManageSeo(user)) {
      return NextResponse.json({
        needsConfirm: true,
        estimatedCostUsd,
        gsc: {
          clicks: gscAgg.clicks,
          impressions: gscAgg.impressions,
          ctr: gscAgg.impressions > 0 ? gscAgg.clicks / gscAgg.impressions : 0,
          position: gscAgg.impressions > 0 ? gscAgg.posW / gscAgg.impressions : null,
        },
      });
    }

    const bundle = await researchKeyword({
      keyword,
      country,
      language,
      includeSuggestions: include,
      seoProjectId: loaded.seoProject.id,
    });
    const decorate = (items: typeof bundle.suggestions) => items.map((item) => ({
      ...item,
      tracked: trackedSet.has(normalizeKeyword(item.keyword)),
      ourPosition: tracked.find((row) => row.normalizedKeyword === normalizeKeyword(item.keyword))?.currentPosition ?? null,
    }));
    return NextResponse.json({
      ...bundle,
      overview: decorate([bundle.overview])[0],
      suggestions: decorate(bundle.suggestions),
      related: decorate(bundle.related),
      questions: decorate(bundle.questions),
      gsc: {
        clicks: gscAgg.clicks,
        impressions: gscAgg.impressions,
        ctr: gscAgg.impressions > 0 ? gscAgg.clicks / gscAgg.impressions : 0,
        position: gscAgg.impressions > 0 ? gscAgg.posW / gscAgg.impressions : null,
      },
    });
  } catch (error) {
    if (error instanceof KeywordResearchNotConfiguredError) {
      return NextResponse.json({ error: error.message, configured: false }, { status: 503 });
    }
    if (error instanceof BudgetExceededError) {
      return NextResponse.json({ error: error.message }, { status: 402 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Research falló." }, { status: 500 });
  }
}
