import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { getCurrentUser } from "@/lib/auth";
import { findAccessibleProject } from "@/lib/personal-workspace";

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; techId: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { id, techId } = await params;
        if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
        const result = await prisma.projectTech.deleteMany({ where: { id: techId, projectId: id } });
        if (result.count === 0) return NextResponse.json({ error: "Tecnologia no encontrada" }, { status: 404 });
        invalidateCache(`project:${id}`);
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
