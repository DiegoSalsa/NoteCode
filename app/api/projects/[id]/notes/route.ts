import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { getCurrentUser } from "@/lib/auth";
import { findAccessibleProject, isPersonalProject, PERSONAL_VISIBILITY, COMPANY_VISIBILITY } from "@/lib/personal-workspace";
import { jsonWithIdempotency } from "@/lib/idempotency-server";
import { slugFromTitle, syncNoteLinks } from "@/lib/note-links";
import { recordAudit } from "@/lib/audit";

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
        const title = typeof body.title === "string" ? body.title.trim() : "";
        if (!title) return NextResponse.json({ error: "El título es obligatorio." }, { status: 400 });
        return jsonWithIdempotency(request, user.id, async () => {
            const item = await prisma.note.create({
                data: {
                    projectId: id,
                    title,
                    content: body.content || "",
                    folder: "Proyecto",
                    visibility: isPersonalProject(project) ? PERSONAL_VISIBILITY : COMPANY_VISIBILITY,
                    personalOwnerId: isPersonalProject(project) ? user.id : null,
                    pinned: Boolean(body.pinned),
                    tags: Array.isArray(body.tags) ? body.tags : [],
                },
            });
            const slug = slugFromTitle(title, item.id);
            const updated = await prisma.note.update({ where: { id: item.id }, data: { slug } });
            await prisma.noteRevision.create({
                data: { noteId: item.id, title, content: body.content || "", version: 1, createdBy: user.id },
            });
            await syncNoteLinks(item.id, body.content || "");
            invalidateCache(`project:${id}`);
            invalidateCache("notes");
            await recordAudit({ action: "create", entityType: "note", entityId: item.id, summary: `Nota creada: ${title}` });
            return { status: 201, body: updated };
        });
    } catch {
        return NextResponse.json({ error: "Failed" }, { status: 500 });
    }
}
