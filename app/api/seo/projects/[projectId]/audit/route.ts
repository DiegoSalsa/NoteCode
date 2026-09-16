import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AUDIT_RULE_MAP } from "@/lib/seo/audit-rules";
import { HEALTH_CAPS, HEALTH_WEIGHTS } from "@/lib/seo/health";
import { diffIssues } from "@/lib/seo/alerts";
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
  const crawls = await prisma.seoCrawl.findMany({
    where: { seoProjectId: loaded.seoProject.id },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const latest = crawls[0] ?? null;
  const previous = crawls[1] ?? null;
  let diff = null;
  if (latest && previous) {
    const [currentIssues, previousIssues] = await Promise.all([
      prisma.seoCrawlIssue.findMany({ where: { crawlId: latest.id }, select: { identityKey: true, ruleKey: true } }),
      prisma.seoCrawlIssue.findMany({ where: { crawlId: previous.id }, select: { identityKey: true, ruleKey: true } }),
    ]);
    const raw = diffIssues(currentIssues, previousIssues);
    diff = { newIssues: raw.newIssues.length, resolvedIssues: raw.resolvedIssues.length, persistingIssues: raw.persistingIssues.length };
  }
  return NextResponse.json({
    project: loaded.seoProject.project,
    seoProject: {
      crawlBaseUrl: loaded.seoProject.crawlBaseUrl,
      primaryDomain: loaded.seoProject.primaryDomain,
      lastHealthScore: loaded.seoProject.lastHealthScore,
      lastAuditAt: loaded.seoProject.lastAuditAt,
      lastAuditStatus: loaded.seoProject.lastAuditStatus,
    },
    latest,
    crawls,
    diff,
    formula: { weights: HEALTH_WEIGHTS, caps: HEALTH_CAPS },
    rules: AUDIT_RULE_MAP,
  });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo cargar la auditoría." }, { status: 500 });
  }
}
