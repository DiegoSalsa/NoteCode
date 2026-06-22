import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { z } from "zod";

const requirementPatchSchema = z.object({
    description: z.string().trim().min(1).max(500).optional(),
    category: z.enum(["Funcional", "No funcional"]).optional(),
    priority: z.enum(["Baja", "Media", "Alta"]).optional(),
    completed: z.boolean().optional(),
});

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; reqId: string }> }
) {
    try {
        const { id, reqId } = await params;
        const body = requirementPatchSchema.safeParse(await request.json());
        if (!body.success) {
            return NextResponse.json({ error: "Invalid requirement payload" }, { status: 400 });
        }

        const current = await prisma.projectRequirement.findFirst({
            where: { id: reqId, projectId: id },
        });

        if (!current) {
            return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
        }

        const item = await prisma.projectRequirement.update({
            where: { id: reqId },
            data: {
                description: body.data.description,
                category: body.data.category,
                priority: body.data.priority,
                completed: body.data.completed,
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
        const result = await prisma.projectRequirement.deleteMany({
            where: { id: reqId, projectId: id },
        });
        if (result.count === 0) {
            return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
        }
        invalidateCache(`project:${id}`);
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
