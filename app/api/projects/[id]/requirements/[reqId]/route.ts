import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; reqId: string }> }
) {
    try {
        const { id, reqId } = await params;
        const body = await request.json();
        const item = await prisma.projectRequirement.update({
            where: { id: reqId },
            data: {
                description: body.description,
                category: body.category,
                priority: body.priority,
                completed: body.completed,
            },
        });
        invalidateCache(`project:${id}`);
        return NextResponse.json(item);
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; reqId: string }> }
) {
    try {
        const { id, reqId } = await params;
        await prisma.projectRequirement.delete({ where: { id: reqId } });
        invalidateCache(`project:${id}`);
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
