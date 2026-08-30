import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { getCurrentUser } from "@/lib/auth";
import { findAccessibleProject } from "@/lib/personal-workspace";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; noteId: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { id, noteId } = await params;
        if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
        const body = await request.json();
        const title = typeof body.title === "string" ? body.title.trim() : "";
        if (!title) return NextResponse.json({ error: "El título es obligatorio" }, { status: 400 });
        const current = await prisma.note.findFirst({
            where: { id: noteId, projectId: id, deletedAt: null },
            select: { id: true },
        });
        if (!current) return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
        const item = await prisma.note.update({
            where: { id: noteId },
            data: {
                title,
                content: typeof body.content === "string" ? body.content : "",
            },
        });
        invalidateCache(`project:${id}`);
        invalidateCache("notes");
        return NextResponse.json(item);
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; noteId: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { id, noteId } = await params;
        if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
        const result = await prisma.note.updateMany({
            where: { id: noteId, projectId: id },
            data: { deletedAt: new Date() },
        });
        if (result.count === 0) return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
        invalidateCache(`project:${id}`);
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
