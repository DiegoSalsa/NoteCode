import { prisma } from "@/lib/prisma";

const HEALTH_DROP = Number(process.env.SEO_HEALTH_DROP_ALERT_POINTS || "10") || 10;

export async function generateAlertsForCrawl(crawlId: string) {
  const crawl = await prisma.seoCrawl.findUnique({
    where: { id: crawlId },
    include: { issues: true, seoProject: { select: { id: true, lastHealthScore: true } } },
  });
  if (!crawl) return [];
  const previous = await prisma.seoCrawl.findFirst({
    where: { seoProjectId: crawl.seoProjectId, status: "completed", id: { not: crawlId } },
    orderBy: { createdAt: "desc" },
    include: { issues: true },
  });
  const prevKeys = new Set((previous?.issues ?? []).map((item) => item.identityKey));
  const created = [];

  for (const issue of crawl.issues) {
    if (issue.severity !== "CRITICAL" && issue.severity !== "HIGH") continue;
    if (prevKeys.has(issue.identityKey)) continue;
    const type = issue.ruleKey === "HTTP_404" ? "HTTP_404_NEW"
      : issue.ruleKey === "HTTP_5XX" || issue.ruleKey === "HOME_5XX" ? "HTTP_5XX_NEW"
        : issue.ruleKey === "NOINDEX" ? "NOINDEX_NEW"
          : issue.ruleKey === "CANONICAL_BROKEN" ? "CANONICAL_CHANGED"
            : issue.ruleKey === "SITEMAP_FAILED" ? "SITEMAP_FAILED"
              : issue.severity === "CRITICAL" ? "NEW_CRITICAL_ISSUE" : "NEW_HIGH_ISSUE";
    created.push(await upsertAlert({
      seoProjectId: crawl.seoProjectId,
      crawlId,
      type,
      severity: issue.severity,
      identityKey: `${type}:${issue.identityKey}`,
      title: issue.ruleKey,
      message: issue.message,
      url: issue.url,
      ruleKey: issue.ruleKey,
    }));
  }

  if (previous?.healthScore != null && crawl.healthScore != null && previous.healthScore - crawl.healthScore >= HEALTH_DROP) {
    created.push(await upsertAlert({
      seoProjectId: crawl.seoProjectId,
      crawlId,
      type: "HEALTH_DROPPED",
      severity: "HIGH",
      identityKey: `HEALTH_DROPPED:${crawl.seoProjectId}:${crawl.id}`,
      title: "Caída de SEO Health",
      message: `Health ${previous.healthScore} → ${crawl.healthScore}`,
    }));
  }

  if (crawl.robotsStatus === "error") {
    created.push(await upsertAlert({
      seoProjectId: crawl.seoProjectId,
      crawlId,
      type: "ROBOTS_CHANGED",
      severity: "HIGH",
      identityKey: `ROBOTS_CHANGED:${crawl.seoProjectId}:open`,
      title: "robots.txt con error",
      message: "No se pudo leer robots.txt en esta auditoría.",
    }));
  }
  return created.filter(Boolean);
}

async function upsertAlert(input: {
  seoProjectId: string;
  crawlId: string;
  type: string;
  severity: string;
  identityKey: string;
  title: string;
  message: string;
  url?: string | null;
  ruleKey?: string | null;
}) {
  const open = await prisma.seoAlert.findFirst({ where: { seoProjectId: input.seoProjectId, identityKey: input.identityKey, status: "open" } });
  if (open) {
    return prisma.seoAlert.update({ where: { id: open.id }, data: { lastSeenAt: new Date(), crawlId: input.crawlId, message: input.message } });
  }
  const ignored = await prisma.seoAlert.findFirst({ where: { seoProjectId: input.seoProjectId, identityKey: input.identityKey, status: "ignored" } });
  if (ignored) return ignored;
  return prisma.seoAlert.create({ data: { ...input, status: "open" } });
}

export function diffIssues(current: Array<{ identityKey: string; ruleKey: string }>, previous: Array<{ identityKey: string; ruleKey: string }>) {
  const prev = new Set(previous.map((item) => item.identityKey));
  const curr = new Set(current.map((item) => item.identityKey));
  return {
    newIssues: current.filter((item) => !prev.has(item.identityKey)),
    resolvedIssues: previous.filter((item) => !curr.has(item.identityKey)),
    persistingIssues: current.filter((item) => prev.has(item.identityKey)),
  };
}
