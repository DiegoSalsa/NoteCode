import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncProjectInvoice } from "@/lib/projects";
import { invalidateCache } from "@/lib/server-cache";
import { canManage, getCurrentUser } from "@/lib/auth";
import { findAccessibleProject, isPersonalProject } from "@/lib/personal-workspace";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { id } = await params;
        if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
        const logs = await prisma.projectStatusLog.findMany({
            where: { projectId: id },
            orderBy: { createdAt: "desc" },
        });
        return NextResponse.json(logs);
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    try {
        const { id } = await params;
        const project = await findAccessibleProject(id, user.id);
        if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
        if (!isPersonalProject(project) && !canManage(user)) {
            return NextResponse.json({ error: "Sin permisos para cambiar el estado del proyecto." }, { status: 403 });
        }
        const body = await request.json();

        const [log] = await prisma.$transaction([
            prisma.projectStatusLog.create({
                data: { projectId: id, status: body.status, note: body.note || null },
            }),
            prisma.project.update({
                where: { id },
                data: { status: body.status },
            }),
        ]);

        if (!isPersonalProject(project)) await syncProjectInvoice(id);
        invalidateCache(`project:${id}`);
        invalidateCache("projects:");
        invalidateCache("erp:");

        return NextResponse.json(log, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
