import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { findAccessibleProject } from "@/lib/personal-workspace";
import { recordAudit } from "@/lib/audit";
import { jsonWithIdempotency } from "@/lib/idempotency-server";
import { nextRequirementCode } from "@/lib/requirement-code";
import { logEvent } from "@/lib/log";

const requirementSchema = z.object({
    description: z.string().trim().min(1).max(500),
    category: z.enum(["Funcional", "No funcional", "Técnico", "UX/UI", "Seguridad"]).default("Funcional"),
    priority: z.enum(["Baja", "Media", "Alta"]).default("Media"),
    clientVisible: z.boolean().default(false),
});

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { id } = await params;
        if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
        const items = await prisma.projectRequirement.findMany({
            where: { projectId: id, deletedAt: null },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        });
        return NextResponse.json(items);
    } catch (error) {
        logEvent("error", "requirements.fetch", { error: error instanceof Error ? error.message : "unknown" });
        return NextResponse.json({ error: "No se pudieron cargar los requisitos." }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { id } = await params;
        if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
        const body = requirementSchema.safeParse(await request.json());
        if (!body.success) {
            return NextResponse.json({ error: "El requisito no es válido." }, { status: 400 });
        }

        return jsonWithIdempotency(request, user.id, async () => {
            const existing = await prisma.projectRequirement.findMany({
                where: { projectId: id },
                select: { code: true, sortOrder: true },
            });
            const item = await prisma.projectRequirement.create({
                data: {
                    projectId: id,
                    code: nextRequirementCode(existing.map((row) => row.code)),
                    description: body.data.description,
                    category: body.data.category,
                    priority: body.data.priority,
                    clientVisible: body.data.clientVisible,
                    sortOrder: existing.length,
                },
            });
            invalidateCache(`project:${id}`);
            invalidateCache("erp:");
            await recordAudit({
                action: "create",
                entityType: "requirement",
                entityId: item.id,
                summary: `Requisito ${item.code} creado`,
            });
            return { status: 201, body: item };
        });
    } catch (error) {
        logEvent("error", "requirements.create", { error: error instanceof Error ? error.message : "unknown" });
        return NextResponse.json({ error: "No se pudo crear el requisito." }, { status: 500 });
    }
}
