import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findAccessibleProject } from "@/lib/personal-workspace";
import { invalidateCache } from "@/lib/server-cache";
import { recordAudit } from "@/lib/audit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  const body = await request.json() as { entity: "tasks" | "requirements"; ids: string[]; patch: { status?: string; priority?: string; category?: string }; confirm?: string };
  if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 100) {
    return NextResponse.json({ error: "Selecciona entre 1 y 100 elementos." }, { status: 400 });
  }
  if (body.patch.status === "deleted" && body.confirm !== "ELIMINAR") {
    return NextResponse.json({ error: "Confirma la eliminación masiva." }, { status: 400 });
  }
  if (body.entity === "tasks") {
    if (body.patch.status === "deleted") {
      await prisma.projectTask.updateMany({ where: { projectId: id, id: { in: body.ids } }, data: { deletedAt: new Date(), deletedById: user.id } });
    } else {
      await prisma.projectTask.updateMany({ where: { projectId: id, id: { in: body.ids }, deletedAt: null }, data: { status: body.patch.status, priority: body.patch.priority } });
    }
  } else if (body.patch.status === "deleted") {
    await prisma.projectRequirement.updateMany({ where: { projectId: id, id: { in: body.ids } }, data: { deletedAt: new Date(), deletedById: user.id } });
  } else {
    await prisma.projectRequirement.updateMany({ where: { projectId: id, id: { in: body.ids }, deletedAt: null }, data: { priority: body.patch.priority, category: body.patch.category } });
  }
  invalidateCache(`project:${id}`);
  await recordAudit({ action: "bulk_update", entityType: body.entity, entityId: id, summary: `Operación masiva sobre ${body.ids.length} elementos` });
  return NextResponse.json({ success: true, count: body.ids.length });
}
