import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addUtcDays, utcToday } from "@/lib/seo/dates";
import { pageKey } from "@/lib/seo/domain";
import { canViewSeo } from "@/lib/seo/permissions";
import { loadCompanySeoProject } from "@/lib/seo/project-access";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { projectId } = await params;
    const loaded = await loadCompanySeoProject(projectId, user.id);
    if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado." }, { status: 404 });
    const host = loaded.seoProject.primaryDomain;
    const from = addUtcDays(utcToday(), -27);
    const keyFilter = request.nextUrl.searchParams.get("key")?.trim() || "";
    const [gscPages, ga4, crawl, keywords, opportunities] = await Promise.all([
      prisma.seoGscPageDaily.findMany({ where: { seoProjectId: loaded.seoProject.id, date: { gte: from } } }),
      prisma.seoGa4LandingDaily.findMany({ where: { seoProjectId: loaded.seoProject.id, date: { gte: from } } }),
      prisma.seoCrawl.findFirst({
        where: { seoProjectId: loaded.seoProject.id, status: "completed" },
        orderBy: { createdAt: "desc" },
        include: { pages: true, issues: true },
      }),
      prisma.seoKeyword.findMany({ where: { seoProjectId: loaded.seoProject.id } }),
      prisma.seoOpportunity.findMany({ where: { seoProjectId: loaded.seoProject.id, status: { in: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"] } } }),
    ]);

    const map = new Map<string, any>();
    function row(key: string) {
      const current = map.get(key) ?? {
        pageKey: key,
        url: key,
        gsc: { clicks: 0, impressions: 0, posW: 0 },
        ga4: { sessions: 0, users: 0, keyEvents: 0 },
        tracked: [] as any[],
        issues: [] as any[],
        opportunities: [] as any[],
        crawl: null as any,
      };
      map.set(key, current);
      return current;
    }
    for (const item of gscPages) {
      const key = pageKey(item.page, host) || item.page;
      const current = row(key);
      current.url = item.page;
      current.gsc.clicks += item.clicks;
      current.gsc.impressions += item.impressions;
      current.gsc.posW += item.position * item.impressions;
    }
    for (const item of ga4) {
      const key = pageKey(item.landingPage, host) || item.landingPage;
      const current = row(key);
      current.ga4.sessions += item.sessions;
      current.ga4.users += item.users;
      current.ga4.keyEvents += item.keyEvents;
    }
    for (const item of crawl?.pages ?? []) {
      const key = pageKey(item.normalizedUrl, host) || item.normalizedUrl;
      const current = row(key);
      current.crawl = item;
      current.url = item.url;
    }
    for (const issue of crawl?.issues ?? []) {
      const key = pageKey(issue.url || issue.normalizedUrl, host);
      if (!key) continue;
      row(key).issues.push(issue);
    }
    for (const keyword of keywords) {
      const key = pageKey(keyword.currentUrl || keyword.targetUrl, host);
      if (!key) continue;
      row(key).tracked.push(keyword);
    }
    for (const opportunity of opportunities) {
      if (opportunity.pageKey) row(opportunity.pageKey).opportunities.push(opportunity);
    }

    let pages = [...map.values()].map((item) => ({
      ...item,
      gsc: {
        clicks: item.gsc.clicks,
        impressions: item.gsc.impressions,
        ctr: item.gsc.impressions > 0 ? item.gsc.clicks / item.gsc.impressions : 0,
        position: item.gsc.impressions > 0 ? item.gsc.posW / item.gsc.impressions : null,
      },
    }));
    if (keyFilter) pages = pages.filter((item) => item.pageKey === keyFilter || item.url.includes(keyFilter));
    pages.sort((a, b) => b.gsc.clicks - a.gsc.clicks);
    return NextResponse.json({ pages: pages.slice(0, 200) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron cargar páginas." }, { status: 500 });
  }
}
