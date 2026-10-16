import { projectPriceData } from "@/lib/commercial/project-price";
import { commercialFailure } from "@/lib/commercial/http";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveClientId, syncProjectInvoice } from "@/lib/projects";
import { invalidateCache } from "@/lib/server-cache";
import { canManage, getCurrentUser } from "@/lib/auth";
import { COMPANY_VISIBILITY, PERSONAL_VISIBILITY, workspaceScope } from "@/lib/personal-workspace";
import { jsonWithIdempotency } from "@/lib/idempotency-server";
import { getProjectTemplate } from "@/lib/templates";
import { formatRequirementCode } from "@/lib/requirement-code";
import { recordAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { searchParams } = new URL(request.url);
        const limit = searchParams.get("limit");
        const scope = workspaceScope(searchParams.get("scope"));
        const projects = await prisma.project.findMany({
            where: {
                deletedAt: null,
                ...(scope === "personal"
                    ? { visibility: PERSONAL_VISIBILITY, personalOwnerId: user.id }
                    : { visibility: COMPANY_VISIBILITY }),
            },
            orderBy: { updatedAt: "desc" },
            take: limit ? parseInt(limit) : undefined,
            include: { client: { select: { id: true, name: true } } },
        });
        return NextResponse.json(projects);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    try {
        const body = await request.json();
        const scope = workspaceScope(body.scope);
        if (scope === "company" && !canManage(user)) {
            return NextResponse.json({ error: "Sin permisos para crear proyectos de empresa." }, { status: 403 });
        }
        if (!body.name || typeof body.name !== "string") {
            return NextResponse.json({ error: "El nombre del proyecto es obligatorio." }, { status: 400 });
        }
        const clientId = scope === "company"
            ? await resolveClientId({ clientId: body.clientId, clientName: body.clientName })
            : null;
        const template = getProjectTemplate(body.template);
        return jsonWithIdempotency(request, user.id, async () => {
            const project = await prisma.project.create({
                data: {
                    name: body.name,
                    description: body.description || template?.description || null,
                    visibility: scope === "personal" ? PERSONAL_VISIBILITY : COMPANY_VISIBILITY,
                    personalOwnerId: scope === "personal" ? user.id : null,
                    status: body.status || "En progreso",
                    agreedAmount: Number(body.agreedAmount) || 0,
                    ...projectPriceData(body),
                    budgetHours: Number(body.budgetHours) || 0,
                    budgetCost: Number(body.budgetCost) || 0,
                    startDate: body.startDate ? new Date(body.startDate) : null,
                    targetDate: body.targetDate ? new Date(body.targetDate) : null,
                    ownerId: scope === "personal" ? null : body.ownerId || null,
                    clientId,
                    objective: body.objective || template?.objective || null,
                    specificObjectives: body.specificObjectives || template?.specificObjectives || null,
                    scope: body.projectScope || template?.scope || null,
                    exclusions: body.exclusions || template?.exclusions || null,
                    priority: body.priority || "Media",
                    templateKey: template?.key ?? null,
                    statusLogs: { create: { status: body.status || "En progreso", note: template ? `Proyecto creado desde plantilla ${template.name}` : "Proyecto creado" } },
                    requirements: template ? {
                        create: template.requirements.map((requirement, index) => ({
                            code: formatRequirementCode(index + 1),
                            description: requirement.description,
                            category: requirement.category,
                            priority: requirement.priority,
                            sortOrder: index,
                        })),
                    } : undefined,
                    tasks: template ? {
                        create: template.tasks.map((task, index) => ({
                            title: task.title,
                            status: task.status,
                            priority: task.priority,
                            sortOrder: index,
                        })),
                    } : undefined,
                    techs: template?.techs ? {
                        create: template.techs.map((tech, index) => ({
                            name: tech.name,
                            category: tech.category,
                            sortOrder: index,
                        })),
                    } : undefined,
                    notes: template ? {
                        create: template.notes.map((note) => ({
                            title: note.title,
                            content: note.content,
                            folder: "Proyecto",
                            visibility: scope === "personal" ? PERSONAL_VISIBILITY : COMPANY_VISIBILITY,
                            personalOwnerId: scope === "personal" ? user.id : null,
                        })),
                    } : undefined,
                    decisions: template ? {
                        create: template.decisions.map((decision) => ({
                            title: decision.title,
                            context: decision.context,
                        })),
                    } : undefined,
                    risks: template ? {
                        create: template.risks.map((risk, index) => ({
                            title: risk.title,
                            impact: risk.impact,
                            sortOrder: index,
                        })),
                    } : undefined,
                    milestones: template ? {
                        create: template.milestones.map((milestone, index) => ({
                            title: milestone.title,
                            sortOrder: index,
                        })),
                    } : undefined,
                },
                include: { client: { select: { id: true, name: true } } },
            });
            if (scope === "company") await syncProjectInvoice(project.id);
            invalidateCache("projects:");
            invalidateCache("erp:");
            invalidateCache("vault");
            invalidateCache("dashboard:");
            invalidateCache("reports:");
            invalidateCache("gilberto:today:");
            await recordAudit({ action: "create", entityType: "project", entityId: project.id, summary: `Proyecto creado: ${project.name}` });
            return { status: 201, body: project };
        });
    } catch (error) {
        return commercialFailure(error);
    }
}
