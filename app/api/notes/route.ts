import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cached, invalidateCache } from "@/lib/server-cache";
import { getCurrentUser } from "@/lib/auth";
import { COMPANY_VISIBILITY, PERSONAL_VISIBILITY, findAccessibleProject, personalNotesWhere, workspaceScope } from "@/lib/personal-workspace";
import { jsonWithIdempotency } from "@/lib/idempotency-server";
import { slugFromTitle, syncNoteLinks } from "@/lib/note-links";

const DEFAULT_TAKE = 30;
const MAX_TAKE = 80;

export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const { searchParams } = new URL(request.url);
        const q = searchParams.get("q")?.trim() || "";
        const folder = searchParams.get("folder")?.trim() || "";
        const scope = workspaceScope(searchParams.get("scope"));
        const skip = Math.max(0, Number(searchParams.get("skip") ?? "0") || 0);
        const take = Math.min(MAX_TAKE, Math.max(1, Number(searchParams.get("take") ?? DEFAULT_TAKE) || DEFAULT_TAKE));
        const where = {
            deletedAt: null,
            ...(scope === "personal" ? personalNotesWhere(user.id) : { visibility: COMPANY_VISIBILITY }),
            ...(folder ? { folder } : {}),
            ...(q
                ? {
                    OR: [
                        { title: { contains: q, mode: "insensitive" as const } },
                        { content: { contains: q, mode: "insensitive" as const } },
                    ],
                }
                : {}),
        };
        const ownerCacheKey = scope === "personal" ? `:${user.id}` : "";
        const notes = await cached(`notes:${scope}${ownerCacheKey}:${q}:${folder}:${skip}:${take}`, 30_000, async () => {
            const [items, total, folderRows] = await Promise.all([
                prisma.note.findMany({
                    where,
                    orderBy: { updatedAt: "desc" },
                    skip,
                    take,
                    select: {
                        id: true,
                        title: true,
                        content: true,
                        folder: true,
                        project: { select: { id: true, name: true } },
                        updatedAt: true,
                        createdAt: true,
                    },
                }),
                prisma.note.count({ where }),
                prisma.note.findMany({
                    where: { deletedAt: null, ...(scope === "personal" ? personalNotesWhere(user.id) : { visibility: COMPANY_VISIBILITY }) },
                    distinct: ["folder"],
                    orderBy: { folder: "asc" },
                    select: { folder: true },
                }),
            ]);

            return {
                items,
                folders: folderRows.map((row) => row.folder).filter(Boolean),
                nextSkip: skip + items.length,
                hasMore: skip + items.length < total,
                total,
            };
        });
        return NextResponse.json(notes);
    } catch (error) {
        return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
        const body = await request.json();
        const scope = workspaceScope(body.scope);
        const title = typeof body.title === "string" ? body.title.trim() : "";
        if (!title) return NextResponse.json({ error: "El título es obligatorio." }, { status: 400 });
        const requestedProjectId = scope === "company" ? body.projectId || null : null;
        if (requestedProjectId && !await findAccessibleProject(requestedProjectId, user.id)) {
            return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
        }
        return jsonWithIdempotency(request, user.id, async () => {
            const note = await prisma.note.create({
                data: {
                    title,
                    content: body.content || "",
                    folder: body.folder || "General",
                    projectId: requestedProjectId,
                    visibility: scope === "personal" ? PERSONAL_VISIBILITY : COMPANY_VISIBILITY,
                    personalOwnerId: scope === "personal" ? user.id : null,
                    tags: Array.isArray(body.tags) ? body.tags : [],
                },
            });
            const updated = await prisma.note.update({ where: { id: note.id }, data: { slug: slugFromTitle(title, note.id) } });
            await prisma.noteRevision.create({ data: { noteId: note.id, title, content: body.content || "", version: 1, createdBy: user.id } });
            await syncNoteLinks(note.id, body.content || "");
            invalidateCache("notes");
            return { status: 201, body: updated };
        });
    } catch (error) {
        return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
    }
}
