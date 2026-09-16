import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { seoAuditCooldownMs } from "@/lib/seo/config";
import { processCrawlBatch, startProjectCrawl } from "@/lib/seo/crawler";
import { canManageSeo } from "@/lib/seo/permissions";
import { loadCompanySeoProject } from "@/lib/seo/project-access";

type Params = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageSeo(user)) return NextResponse.json({ error: "Sin permisos para ejecutar auditorías." }, { status: 403 });
  const limit = rateLimit(clientKey(request, `seo-audit:${user.id}`), 1, seoAuditCooldownMs());
  if (!limit.ok) return NextResponse.json({ error: "Espera antes de lanzar otra auditoría.", retryAfterMs: limit.retryAfterMs }, { status: 429 });
  const { projectId } = await params;
  const loaded = await loadCompanySeoProject(projectId, user.id);
  if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado." }, { status: 404 });
  const active = await prisma.seoCrawl.findFirst({ where: { seoProjectId: loaded.seoProject.id, status: { in: ["queued", "running"] } } });
  const crawl = active ?? await startProjectCrawl(loaded.seoProject.id, "manual");
  const result = await processCrawlBatch(crawl.id);
  return NextResponse.json({ success: true, crawl: result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo ejecutar la auditoría." }, { status: 500 });
  }
}
