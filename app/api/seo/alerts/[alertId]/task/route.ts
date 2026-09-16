import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { canManageSeo } from "@/lib/seo/permissions";

type Params = { params: Promise<{ alertId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageSeo(user)) return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  const { alertId } = await params;
  const alert = await prisma.seoAlert.findUnique({
    where: { id: alertId },
    include: { seoProject: { select: { projectId: true, project: { select: { name: true } } } } },
  });
  if (!alert) return NextResponse.json({ error: "Alerta no encontrada." }, { status: 404 });
  if (alert.taskId) {
    const existing = await prisma.projectTask.findUnique({ where: { id: alert.taskId } });
    return NextResponse.json({ success: true, task: existing, alert });
  }
  const count = await prisma.projectTask.count({ where: { projectId: alert.seoProject.projectId } });
  const task = await prisma.projectTask.create({
    data: {
      projectId: alert.seoProject.projectId,
      title: alert.title.slice(0, 180),
      description: `SEO · ${alert.seoProject.project.name}\n${alert.message}\n${alert.url || ""}\nAlerta: ${alert.id}`.slice(0, 2000),
      status: "Por hacer",
      priority: alert.severity === "CRITICAL" || alert.severity === "HIGH" ? "Alta" : "Media",
      sortOrder: count,
    },
  });
  const updated = await prisma.seoAlert.update({ where: { id: alert.id }, data: { taskId: task.id } });
  await recordAudit({ action: "create", entityType: "task", entityId: task.id, summary: `Tarea SEO desde alerta: ${task.title}` });
  return NextResponse.json({ success: true, task, alert: updated });
}
