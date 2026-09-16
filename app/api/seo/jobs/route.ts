import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewSeo } from "@/lib/seo/permissions";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const take = Math.min(50, Math.max(1, Number(searchParams.get("take") || 25) || 25));
  const jobs = await prisma.seoSyncJob.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: {
      seoProject: { select: { project: { select: { id: true, name: true } } } },
    },
  });
  return NextResponse.json({
    jobs: jobs.map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      trigger: job.trigger,
      recordsProcessed: job.recordsProcessed,
      error: job.error,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      durationMs: job.durationMs,
      project: job.seoProject?.project ?? null,
    })),
  });
}
