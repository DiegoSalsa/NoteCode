import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { getCurrentUser } from "@/lib/auth";
import { findAccessibleProject } from "@/lib/personal-workspace";
import { recordAudit } from "@/lib/audit";
import { assertVersion, ConflictError, nextVersion } from "@/lib/concurrency";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; techId: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { id, techId } = await params;
        if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
        const body = await request.json();
        const current = await prisma.projectTech.findFirst({ where: { id: techId, projectId: id, deletedAt: null } });
        if (!current) return NextResponse.json({ error: "Tecnología no encontrada" }, { status: 404 });
        assertVersion(current.version, body.version);
        const item = await prisma.projectTech.update({
            where: { id: techId },
            data: {
                name: typeof body.name === "string" ? body.name.trim() : undefined,
                category: typeof body.category === "string" ? body.category : undefined,
                sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined,
                version: nextVersion(current.version),
            },
        });
        invalidateCache(`project:${id}`);
        await recordAudit({ action: "update", entityType: "tech", entityId: item.id, summary: `Tecnología actualizada: ${item.name}` });
        return NextResponse.json(item);
    } catch (error) {
        if (error instanceof ConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
        return NextResponse.json({ error: "No se pudo actualizar la tecnología." }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; techId: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { id, techId } = await params;
        if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
        const result = await prisma.projectTech.updateMany({
            where: { id: techId, projectId: id, deletedAt: null },
            data: { deletedAt: new Date(), deletedById: user.id },
        });
        if (result.count === 0) return NextResponse.json({ error: "Tecnología no encontrada" }, { status: 404 });
        invalidateCache(`project:${id}`);
        await recordAudit({ action: "delete", entityType: "tech", entityId: techId, summary: "Tecnología enviada a papelera" });
        return NextResponse.json({ success: true, recoverable: true });
    } catch {
        return NextResponse.json({ error: "No se pudo eliminar la tecnología." }, { status: 500 });
    }
}
