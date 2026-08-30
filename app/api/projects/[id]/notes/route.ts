import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { getCurrentUser } from "@/lib/auth";
import { findAccessibleProject, isPersonalProject, PERSONAL_VISIBILITY, COMPANY_VISIBILITY } from "@/lib/personal-workspace";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { id } = await params;
        const project = await findAccessibleProject(id, user.id);
        if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
        const items = await prisma.note.findMany({
            where: {
                projectId: id,
                deletedAt: null,
                visibility: project.visibility,
                ...(isPersonalProject(project) ? { personalOwnerId: user.id } : {}),
            },
            orderBy: { updatedAt: "desc" },
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
        const body = await request.json();
        const project = await findAccessibleProject(id, user.id);
        if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
        const item = await prisma.note.create({
            data: {
                projectId: id,
                title: body.title,
                content: body.content || "",
                folder: "Proyecto",
                visibility: isPersonalProject(project) ? PERSONAL_VISIBILITY : COMPANY_VISIBILITY,
                personalOwnerId: isPersonalProject(project) ? user.id : null,
            },
        });
        invalidateCache(`project:${id}`);
        return NextResponse.json(item, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
