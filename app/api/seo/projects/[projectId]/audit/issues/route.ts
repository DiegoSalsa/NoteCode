import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AUDIT_RULE_MAP } from "@/lib/seo/audit-rules";
import { canViewSeo } from "@/lib/seo/permissions";
import { loadCompanySeoProject } from "@/lib/seo/project-access";
import { addUtcDays, utcToday } from "@/lib/seo/dates";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { projectId } = await params;
  const loaded = await loadCompanySeoProject(projectId, user.id);
  if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado." }, { status: 404 });
  const { searchParams } = new URL(request.url);
  const crawlId = searchParams.get("crawlId");
  const latest = crawlId
    ? await prisma.seoCrawl.findFirst({ where: { id: crawlId, seoProjectId: loaded.seoProject.id } })
    : await prisma.seoCrawl.findFirst({ where: { seoProjectId: loaded.seoProject.id }, orderBy: { createdAt: "desc" } });
  if (!latest) return NextResponse.json({ crawl: null, groups: [] });
  const issues = await prisma.seoCrawlIssue.findMany({ where: { crawlId: latest.id } });
  const grouped = new Map<string, typeof issues>();
  for (const issue of issues) {
    grouped.set(issue.ruleKey, [...(grouped.get(issue.ruleKey) ?? []), issue]);
  }
  const from = addUtcDays(utcToday(), -28);
  const gsc = await prisma.seoGscPageDaily.findMany({
    where: { seoProjectId: loaded.seoProject.id, date: { gte: from } },
    select: { page: true, clicks: true },
  });
  const clicks = new Map<string, number>();
  for (const row of gsc) clicks.set(row.page, (clicks.get(row.page) ?? 0) + row.clicks);

  const groups = [...grouped.entries()].map(([ruleKey, rows]) => ({
    ruleKey,
    rule: AUDIT_RULE_MAP[ruleKey] ?? null,
    severity: rows[0]?.severity,
    category: rows[0]?.category,
    pages: rows.length,
    urls: rows.map((row) => ({
      url: row.url,
      message: row.message,
      clicks: clicks.get(row.url || "") || 0,
    })),
  }));
  return NextResponse.json({ crawl: latest, groups });
}
