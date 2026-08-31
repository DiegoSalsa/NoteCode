import { NextRequest, NextResponse } from "next/server";
import { canManage, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_VISIBILITY, PERSONAL_VISIBILITY } from "@/lib/personal-workspace";
import { recordAudit } from "@/lib/audit";
import { invalidateCache } from "@/lib/server-cache";

const RETENTION_DAYS = Number(process.env.TRASH_RETENTION_DAYS || "30") || 30;

function projectAccess(userId: string) {
  return {
    OR: [
      { visibility: COMPANY_VISIBILITY },
      { visibility: PERSONAL_VISIBILITY, personalOwnerId: userId },
    ],
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const access = projectAccess(user.id);
  const [projects, tasks, requirements, notes, documents, techs] = await Promise.all([
    prisma.project.findMany({ where: { deletedAt: { not: null }, ...access }, select: { id: true, name: true, deletedAt: true, deletedById: true }, orderBy: { deletedAt: "desc" }, take: 50 }),
    prisma.projectTask.findMany({ where: { deletedAt: { not: null }, project: access }, select: { id: true, title: true, projectId: true, deletedAt: true, deletedById: true }, orderBy: { deletedAt: "desc" }, take: 50 }),
    prisma.projectRequirement.findMany({ where: { deletedAt: { not: null }, project: access }, select: { id: true, code: true, description: true, projectId: true, deletedAt: true, deletedById: true }, orderBy: { deletedAt: "desc" }, take: 50 }),
    prisma.note.findMany({
      where: {
        deletedAt: { not: null },
        OR: [{ visibility: COMPANY_VISIBILITY }, { visibility: PERSONAL_VISIBILITY, personalOwnerId: user.id }],
      },
      select: { id: true, title: true, projectId: true, deletedAt: true, deletedById: true },
      orderBy: { deletedAt: "desc" },
      take: 50,
    }),
    prisma.document.findMany({
      where: { deletedAt: { not: null }, OR: [{ projectId: null }, { project: access }] },
      select: { id: true, name: true, projectId: true, deletedAt: true, deletedById: true },
      orderBy: { deletedAt: "desc" },
      take: 50,
    }),
    prisma.projectTech.findMany({ where: { deletedAt: { not: null }, project: access }, select: { id: true, name: true, projectId: true, deletedAt: true, deletedById: true }, orderBy: { deletedAt: "desc" }, take: 50 }),
  ]);
  return NextResponse.json({ retentionDays: RETENTION_DAYS, projects, tasks, requirements, notes, documents, techs });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await request.json() as { entity: string; id: string };
  const restore = { deletedAt: null, deletedById: null };
  if (body.entity === "project") {
    const current = await prisma.project.findFirst({ where: { id: body.id, deletedAt: { not: null }, ...projectAccess(user.id) }, select: { id: true, visibility: true } });
    if (!current) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    if (current.visibility === COMPANY_VISIBILITY && !canManage(user)) return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
    await prisma.project.update({ where: { id: body.id }, data: restore });
  } else if (body.entity === "task") {
    const result = await prisma.projectTask.updateMany({ where: { id: body.id, deletedAt: { not: null }, project: projectAccess(user.id) }, data: restore });
    if (!result.count) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  } else if (body.entity === "requirement") {
    const result = await prisma.projectRequirement.updateMany({ where: { id: body.id, deletedAt: { not: null }, project: projectAccess(user.id) }, data: restore });
    if (!result.count) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  } else if (body.entity === "note") {
    const result = await prisma.note.updateMany({
      where: { id: body.id, deletedAt: { not: null }, OR: [{ visibility: COMPANY_VISIBILITY }, { visibility: PERSONAL_VISIBILITY, personalOwnerId: user.id }] },
      data: restore,
    });
    if (!result.count) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  } else if (body.entity === "document") {
    const result = await prisma.document.updateMany({
      where: { id: body.id, deletedAt: { not: null }, OR: [{ projectId: null }, { project: projectAccess(user.id) }] },
      data: restore,
    });
    if (!result.count) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  } else if (body.entity === "tech") {
    const result = await prisma.projectTech.updateMany({ where: { id: body.id, deletedAt: { not: null }, project: projectAccess(user.id) }, data: restore });
    if (!result.count) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  } else {
    return NextResponse.json({ error: "Entidad no soportada." }, { status: 400 });
  }
  invalidateCache("project:");
  invalidateCache("projects:");
  invalidateCache("notes");
  await recordAudit({ action: "restore", entityType: body.entity, entityId: body.id, summary: "Elemento restaurado desde papelera" });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManage(user)) return NextResponse.json({ error: "La eliminación definitiva requiere un rol de administración." }, { status: 403 });
  const body = await request.json() as { entity: string; id: string; confirm?: string };
  if (body.confirm !== "ELIMINAR") {
    return NextResponse.json({ error: "Confirma escribiendo ELIMINAR." }, { status: 400 });
  }
  if (body.entity === "note") await prisma.note.deleteMany({ where: { id: body.id, deletedAt: { not: null } } });
  else if (body.entity === "task") await prisma.projectTask.deleteMany({ where: { id: body.id, deletedAt: { not: null } } });
  else if (body.entity === "requirement") await prisma.projectRequirement.deleteMany({ where: { id: body.id, deletedAt: { not: null } } });
  else if (body.entity === "document") await prisma.document.deleteMany({ where: { id: body.id, deletedAt: { not: null } } });
  else if (body.entity === "tech") await prisma.projectTech.deleteMany({ where: { id: body.id, deletedAt: { not: null } } });
  else if (body.entity === "project") await prisma.project.deleteMany({ where: { id: body.id, deletedAt: { not: null } } });
  else return NextResponse.json({ error: "Entidad no soportada." }, { status: 400 });
  await recordAudit({ action: "purge", entityType: body.entity, entityId: body.id, summary: "Eliminación definitiva" });
  return NextResponse.json({ success: true });
}
