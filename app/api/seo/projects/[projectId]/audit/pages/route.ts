import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const crawl = await prisma.seoCrawl.findFirst({ where: { seoProjectId: loaded.seoProject.id }, orderBy: { createdAt: "desc" } });
  if (!crawl) return NextResponse.json({ pages: [] });
  const pages = await prisma.seoCrawlPage.findMany({
    where: { crawlId: crawl.id, ...(q ? { url: { contains: q, mode: "insensitive" } } : {}) },
    orderBy: { depth: "asc" },
    take: 200,
  });
  const issues = await prisma.seoCrawlIssue.findMany({
    where: { crawlId: crawl.id, normalizedUrl: { in: pages.map((page) => page.normalizedUrl) } },
    select: { normalizedUrl: true, ruleKey: true, severity: true },
  });
  const issueMap = new Map<string, typeof issues>();
  for (const issue of issues) {
    if (!issue.normalizedUrl) continue;
    issueMap.set(issue.normalizedUrl, [...(issueMap.get(issue.normalizedUrl) ?? []), issue]);
  }
  return NextResponse.json({
    crawlId: crawl.id,
    pages: pages.map((page) => ({ ...page, issues: issueMap.get(page.normalizedUrl) ?? [] })),
  });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron cargar las páginas." }, { status: 500 });
  }
}
