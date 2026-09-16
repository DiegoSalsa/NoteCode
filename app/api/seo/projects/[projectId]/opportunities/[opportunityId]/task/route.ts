import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { canManageSeo } from "@/lib/seo/permissions";
import { loadCompanySeoProject } from "@/lib/seo/project-access";

type Params = { params: Promise<{ projectId: string; opportunityId: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canManageSeo(user)) return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
    const { projectId, opportunityId } = await params;
    const loaded = await loadCompanySeoProject(projectId, user.id);
    if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado." }, { status: 404 });
    const opportunity = await prisma.seoOpportunity.findFirst({
      where: { id: opportunityId, seoProjectId: loaded.seoProject.id },
    });
    if (!opportunity) return NextResponse.json({ error: "Oportunidad no encontrada." }, { status: 404 });
    if (opportunity.taskId) {
      const existing = await prisma.projectTask.findUnique({ where: { id: opportunity.taskId } });
      return NextResponse.json({ success: true, task: existing, opportunity });
    }
    const count = await prisma.projectTask.count({ where: { projectId } });
    const task = await prisma.projectTask.create({
      data: {
        projectId,
        title: opportunity.title.slice(0, 180),
        description: `${opportunity.summary}\n${opportunity.recommendation}\n${opportunity.url || ""}\n${opportunity.keyword || ""}`.slice(0, 2000),
        status: "Por hacer",
        priority: opportunity.score >= 70 ? "Alta" : opportunity.score >= 40 ? "Media" : "Baja",
        sortOrder: count,
      },
    });
    const updated = await prisma.seoOpportunity.update({
      where: { id: opportunity.id },
      data: { taskId: task.id, status: "IN_PROGRESS" },
    });
    await recordAudit({ action: "create", entityType: "task", entityId: task.id, summary: `Tarea SEO desde oportunidad: ${task.title}` });
    return NextResponse.json({ success: true, task, opportunity: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear la tarea." }, { status: 500 });
  }
}
