import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSeo } from "@/lib/seo/permissions";
import { loadCompanySeoProject } from "@/lib/seo/project-access";

type Params = { params: Promise<{ projectId: string; opportunityId: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canManageSeo(user)) return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
    const { projectId, opportunityId } = await params;
    const loaded = await loadCompanySeoProject(projectId, user.id);
    if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado." }, { status: 404 });
    const body = await request.json().catch(() => ({})) as { status?: string };
    if (!["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "IGNORED"].includes(body.status || "")) {
      return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
    }
    const row = await prisma.seoOpportunity.updateMany({
      where: { id: opportunityId, seoProjectId: loaded.seoProject.id },
      data: { status: body.status, resolvedAt: body.status === "RESOLVED" ? new Date() : null },
    });
    return NextResponse.json({ success: true, count: row.count });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo actualizar." }, { status: 500 });
  }
}
