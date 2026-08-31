import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { findAccessibleProject } from "@/lib/personal-workspace";
import { recordAudit } from "@/lib/audit";
import { assertVersion, ConflictError, nextVersion } from "@/lib/concurrency";
import { logEvent } from "@/lib/log";

const requirementPatchSchema = z.object({
    description: z.string().trim().min(1).max(500).optional(),
    category: z.enum(["Funcional", "No funcional", "Técnico", "UX/UI", "Seguridad"]).optional(),
    priority: z.enum(["Baja", "Media", "Alta"]).optional(),
    completed: z.boolean().optional(),
    clientVisible: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    version: z.number().int().optional(),
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; reqId: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { id, reqId } = await params;
        if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
        const body = requirementPatchSchema.safeParse(await request.json());
        if (!body.success) {
            return NextResponse.json({ error: "El requisito no es válido." }, { status: 400 });
        }

        const current = await prisma.projectRequirement.findFirst({
            where: { id: reqId, projectId: id, deletedAt: null },
        });

        if (!current) {
            return NextResponse.json({ error: "Requisito no encontrado" }, { status: 404 });
        }
        assertVersion(current.version, body.data.version);

        const item = await prisma.projectRequirement.update({
            where: { id: reqId },
            data: {
                description: body.data.description,
                category: body.data.category,
                priority: body.data.priority,
                completed: body.data.completed,
                clientVisible: body.data.clientVisible,
                sortOrder: body.data.sortOrder,
                version: nextVersion(current.version),
            },
        });
        invalidateCache(`project:${id}`);
        invalidateCache("erp:");
        await recordAudit({
            action: "update",
            entityType: "requirement",
            entityId: item.id,
            summary: `Requisito ${item.code} actualizado`,
        });
        return NextResponse.json(item);
    } catch (error) {
        if (error instanceof ConflictError) {
            return NextResponse.json({ error: error.message }, { status: 409 });
        }
        logEvent("error", "requirements.update", { error: error instanceof Error ? error.message : "unknown" });
        return NextResponse.json({ error: "No se pudo actualizar el requisito." }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; reqId: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { id, reqId } = await params;
        if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
        const result = await prisma.projectRequirement.updateMany({
            where: { id: reqId, projectId: id, deletedAt: null },
            data: { deletedAt: new Date(), deletedById: user.id },
        });
        if (result.count === 0) {
            return NextResponse.json({ error: "Requisito no encontrado" }, { status: 404 });
        }
        invalidateCache(`project:${id}`);
        invalidateCache("erp:");
        await recordAudit({
            action: "delete",
            entityType: "requirement",
            entityId: reqId,
            summary: "Requisito enviado a papelera",
        });
        return NextResponse.json({ success: true, recoverable: true });
    } catch (error) {
        logEvent("error", "requirements.delete", { error: error instanceof Error ? error.message : "unknown" });
        return NextResponse.json({ error: "No se pudo eliminar el requisito." }, { status: 500 });
    }
}
