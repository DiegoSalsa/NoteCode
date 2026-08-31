import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { getCurrentUser } from "@/lib/auth";
import { findAccessibleProject } from "@/lib/personal-workspace";
import { jsonWithIdempotency } from "@/lib/idempotency-server";
import { recordAudit } from "@/lib/audit";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { id } = await params;
        if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
        const items = await prisma.projectTech.findMany({
            where: { projectId: id, deletedAt: null },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        });
        return NextResponse.json(items);
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
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
        const body = await request.json();
        if (!body.name || typeof body.name !== "string") {
            return NextResponse.json({ error: "El nombre de la tecnología es obligatorio." }, { status: 400 });
        }
        return jsonWithIdempotency(request, user.id, async () => {
            const count = await prisma.projectTech.count({ where: { projectId: id } });
            const item = await prisma.projectTech.create({
                data: {
                    projectId: id,
                    name: String(body.name).trim(),
                    category: body.category || "Frontend",
                    sortOrder: count,
                },
            });
            invalidateCache(`project:${id}`);
            await recordAudit({ action: "create", entityType: "tech", entityId: item.id, summary: `Tecnología agregada: ${item.name}` });
            return { status: 201, body: item };
        });
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
