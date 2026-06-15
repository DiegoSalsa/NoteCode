import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; noteId: string }> }
) {
    try {
        const { noteId } = await params;
        await prisma.projectNote.delete({ where: { id: noteId } });
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}