import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERSONAL_VISIBILITY } from "@/lib/personal-workspace";
import { invalidateCache } from "@/lib/server-cache";
import { recordAudit } from "@/lib/audit";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  const note = await prisma.note.findFirst({
    where: { id, OR: [{ visibility: { not: PERSONAL_VISIBILITY } }, { personalOwnerId: user.id }] },
    select: { id: true },
  });
  if (!note) return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
  const revisions = await prisma.noteRevision.findMany({ where: { noteId: id }, orderBy: { version: "desc" } });
  return NextResponse.json(revisions);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  const body = await request.json() as { revisionId?: string };
  const note = await prisma.note.findFirst({
    where: { id, deletedAt: null, OR: [{ visibility: { not: PERSONAL_VISIBILITY } }, { personalOwnerId: user.id }] },
  });
  if (!note) return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 });
  const revision = await prisma.noteRevision.findFirst({ where: { id: body.revisionId, noteId: id } });
  if (!revision) return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });
  await prisma.noteRevision.create({
    data: { noteId: id, title: note.title, content: note.content, version: note.version, createdBy: user.id },
  });
  const restored = await prisma.note.update({
    where: { id },
    data: { title: revision.title, content: revision.content, version: { increment: 1 } },
  });
  invalidateCache("notes");
  if (note.projectId) invalidateCache(`project:${note.projectId}`);
  await recordAudit({ action: "restore_version", entityType: "note", entityId: id, summary: `Nota restaurada a versión ${revision.version}` });
  return NextResponse.json(restored);
}
