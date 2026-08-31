import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findAccessibleProject } from "@/lib/personal-workspace";
import { invalidateCache } from "@/lib/server-cache";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  const body = await request.json() as { entity: "tasks" | "requirements" | "techs"; orderedIds: string[] };
  if (!Array.isArray(body.orderedIds) || body.orderedIds.length > 400) {
    return NextResponse.json({ error: "Orden inválido." }, { status: 400 });
  }
  const updates = body.orderedIds.map((itemId, index) => {
    if (body.entity === "tasks") return prisma.projectTask.updateMany({ where: { id: itemId, projectId: id }, data: { sortOrder: index } });
    if (body.entity === "requirements") return prisma.projectRequirement.updateMany({ where: { id: itemId, projectId: id }, data: { sortOrder: index } });
    return prisma.projectTech.updateMany({ where: { id: itemId, projectId: id }, data: { sortOrder: index } });
  });
  await prisma.$transaction(updates);
  invalidateCache(`project:${id}`);
  return NextResponse.json({ success: true });
}
