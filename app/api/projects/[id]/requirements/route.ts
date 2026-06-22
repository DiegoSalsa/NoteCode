import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { z } from "zod";

const requirementSchema = z.object({
    description: z.string().trim().min(1).max(500),
    category: z.enum(["Funcional", "No funcional"]).default("Funcional"),
    priority: z.enum(["Baja", "Media", "Alta"]).default("Media"),
});

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const items = await prisma.projectRequirement.findMany({
            where: { projectId: id },
            orderBy: { createdAt: "desc" },
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
        const { id } = await params;
        const body = requirementSchema.safeParse(await request.json());
        if (!body.success) {
            return NextResponse.json({ error: "Invalid requirement payload" }, { status: 400 });
        }

        const item = await prisma.projectRequirement.create({
            data: {
                projectId: id,
                description: body.data.description,
                category: body.data.category,
                priority: body.data.priority,
            },
        });
        invalidateCache(`project:${id}`);
        return NextResponse.json(item, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
