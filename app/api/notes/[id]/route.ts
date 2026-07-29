import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const note = await prisma.note.update({
            where: { id },
            data: {
                title: body.title,
                content: body.content,
                folder: body.folder,
            },
            include: { project: { select: { id: true, name: true } } },
        });
        invalidateCache("notes");
        if (note.projectId) invalidateCache(`project:${note.projectId}`);
        return NextResponse.json(note);
    } catch (error) {
        return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const note = await prisma.note.update({ where: { id }, data: { deletedAt: new Date() } });
        invalidateCache("notes");
        if (note.projectId) invalidateCache(`project:${note.projectId}`);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
    }
}
