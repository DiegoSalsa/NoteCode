import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { runDueSeoJobs } from "@/lib/seo/jobs";
import { canManageSeo } from "@/lib/seo/permissions";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageSeo(user)) return NextResponse.json({ error: "Sin permisos para ejecutar jobs SEO." }, { status: 403 });
  const result = await runDueSeoJobs("manual");
  await recordAudit({
    action: "RUN",
    entityType: "SeoSyncJob",
    entityId: "all",
    summary: `Jobs SEO ejecutados (${result.synced ?? 0} proyectos)`,
  });
  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const result = await runDueSeoJobs("cron");
  return NextResponse.json(result);
}
