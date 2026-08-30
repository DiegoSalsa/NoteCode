import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { findAccessibleProject } from "@/lib/personal-workspace";

const requirementSchema = z.object({
    description: z.string().trim().min(1).max(500),
    category: z.enum(["Funcional", "No funcional", "Técnico", "UX/UI", "Seguridad"]).default("Funcional"),
    priority: z.enum(["Baja", "Media", "Alta"]).default("Media"),
    clientVisible: z.boolean().default(false),
});

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { id } = await params;
        if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
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
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { id } = await params;
        if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
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
                clientVisible: body.data.clientVisible,
            },
        });
        invalidateCache(`project:${id}`);
        invalidateCache("erp:");
        return NextResponse.json(item, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
