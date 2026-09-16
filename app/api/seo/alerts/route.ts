import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewSeo } from "@/lib/seo/permissions";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "";
  const alerts = await prisma.seoAlert.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { seoProject: { select: { project: { select: { id: true, name: true } } } } },
  });
  return NextResponse.json({
    alerts: alerts.map((alert) => ({
      ...alert,
      project: alert.seoProject.project,
    })),
  });
}
