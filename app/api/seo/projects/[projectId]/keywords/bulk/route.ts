import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSeo } from "@/lib/seo/permissions";
import { loadCompanySeoProject } from "@/lib/seo/project-access";

type Params = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageSeo(user)) return NextResponse.json({ error: "Sin permisos para administrar keywords." }, { status: 403 });
  const { projectId } = await params;
  const loaded = await loadCompanySeoProject(projectId, user.id);
  if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado en este proyecto." }, { status: 404 });

  const body = await request.json().catch(() => ({})) as { action?: string; ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string") : [];
  if (!ids.length) return NextResponse.json({ error: "Selecciona al menos una keyword." }, { status: 400 });
  const where = { seoProjectId: loaded.seoProject.id, id: { in: ids } };

  if (body.action === "delete") {
    const result = await prisma.seoKeyword.deleteMany({ where });
    return NextResponse.json({ success: true, count: result.count });
  }
  if (body.action === "activate" || body.action === "deactivate") {
    const active = body.action === "activate";
    const result = await prisma.seoKeyword.updateMany({
      where,
      data: { active, lastSyncStatus: active ? "pending" : "inactive" },
    });
    return NextResponse.json({ success: true, count: result.count });
  }
  return NextResponse.json({ error: "Acción no soportada." }, { status: 400 });
}
