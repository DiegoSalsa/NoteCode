import { prisma } from "@/lib/prisma";
import { extractWikiLinks } from "@/lib/markdown";

export function slugFromTitle(title: string, id?: string) {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "nota";
  return id ? `${base}-${id.slice(0, 8)}` : base;
}

export async function syncNoteLinks(noteId: string, content: string) {
  const links = extractWikiLinks(content);
  await prisma.noteLink.deleteMany({ where: { sourceNoteId: noteId } });
  if (!links.length) return [];
  await prisma.noteLink.createMany({
    data: links.map((link) => ({
      sourceNoteId: noteId,
      targetType: link.type,
      targetId: link.target,
      label: link.label,
    })),
    skipDuplicates: true,
  });
  return links;
}

export async function noteBacklinks(targetId: string) {
  return prisma.noteLink.findMany({
    where: { targetId, targetType: { in: ["note", "project", "requirement", "task"] } },
    include: { sourceNote: { select: { id: true, title: true, slug: true, projectId: true } } },
  });
}
