import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_VISIBILITY, PERSONAL_VISIBILITY } from "@/lib/personal-workspace";
import { snippetAround } from "@/lib/search";
import { redactText } from "@/lib/redact";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const limited = rateLimit(clientKey(request, "search"), 40, 60_000);
  if (!limited.ok) return NextResponse.json({ error: "Demasiadas búsquedas." }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const type = searchParams.get("type") || "all";
  const skip = Math.max(0, Number(searchParams.get("skip") ?? "0") || 0);
  const take = Math.min(40, Math.max(1, Number(searchParams.get("take") ?? "20") || 20));
  if (q.length < 2) return NextResponse.json({ items: [], total: 0, nextSkip: 0, hasMore: false });

  const projectAccess = {
    OR: [
      { visibility: COMPANY_VISIBILITY },
      { visibility: PERSONAL_VISIBILITY, personalOwnerId: user.id },
    ],
  };
  const contains = { contains: q, mode: "insensitive" as const };

  const [projects, tasks, requirements, notes, documents, techs] = await Promise.all([
    type === "all" || type === "project"
      ? prisma.project.findMany({
          where: { deletedAt: null, ...projectAccess, OR: [{ name: contains }, { description: contains }, { objective: contains }] },
          select: { id: true, name: true, description: true },
          take: 20,
        })
      : [],
    type === "all" || type === "task"
      ? prisma.projectTask.findMany({
          where: { deletedAt: null, project: { deletedAt: null, ...projectAccess }, OR: [{ title: contains }, { description: contains }] },
          select: { id: true, title: true, description: true, projectId: true },
          take: 20,
        })
      : [],
    type === "all" || type === "requirement"
      ? prisma.projectRequirement.findMany({
          where: { deletedAt: null, project: { deletedAt: null, ...projectAccess }, OR: [{ description: contains }, { code: contains }] },
          select: { id: true, code: true, description: true, projectId: true },
          take: 20,
        })
      : [],
    type === "all" || type === "note"
      ? prisma.note.findMany({
          where: {
            deletedAt: null,
            OR: [
              { visibility: COMPANY_VISIBILITY },
              { visibility: PERSONAL_VISIBILITY, personalOwnerId: user.id },
            ],
            AND: [{ OR: [{ title: contains }, { content: contains }] }],
          },
          select: { id: true, title: true, content: true, projectId: true },
          take: 20,
        })
      : [],
    type === "all" || type === "document"
      ? prisma.document.findMany({
          where: {
            deletedAt: null,
            name: contains,
            OR: [
              { projectId: null },
              { project: { deletedAt: null, ...projectAccess } },
            ],
          },
          select: { id: true, name: true, category: true, projectId: true },
          take: 20,
        })
      : [],
    type === "all" || type === "tech"
      ? prisma.projectTech.findMany({
          where: { deletedAt: null, project: { deletedAt: null, ...projectAccess }, name: contains },
          select: { id: true, name: true, category: true, projectId: true },
          take: 20,
        })
      : [],
  ]);

  const items = [
    ...projects.map((item) => ({
      type: "project" as const,
      id: item.id,
      title: item.name,
      snippet: redactText(snippetAround(item.description || item.name, q)),
      href: `/proyectos/${item.id}`,
    })),
    ...tasks.map((item) => ({
      type: "task" as const,
      id: item.id,
      projectId: item.projectId,
      title: item.title,
      snippet: redactText(snippetAround(item.description || item.title, q)),
      href: `/proyectos/${item.projectId}?tab=tasks`,
    })),
    ...requirements.map((item) => ({
      type: "requirement" as const,
      id: item.id,
      projectId: item.projectId,
      title: item.code || "Requisito",
      snippet: redactText(snippetAround(item.description, q)),
      href: `/proyectos/${item.projectId}?tab=requirements`,
    })),
    ...notes.map((item) => ({
      type: "note" as const,
      id: item.id,
      projectId: item.projectId,
      title: item.title,
      snippet: redactText(snippetAround(item.content || item.title, q)),
      href: item.projectId ? `/proyectos/${item.projectId}?tab=notes` : "/notas",
    })),
    ...documents.map((item) => ({
      type: "document" as const,
      id: item.id,
      projectId: item.projectId,
      title: item.name,
      snippet: item.category,
      href: item.projectId ? `/proyectos/${item.projectId}?tab=documents` : "/documentos",
    })),
    ...techs.map((item) => ({
      type: "tech" as const,
      id: item.id,
      projectId: item.projectId,
      title: item.name,
      snippet: item.category,
      href: `/proyectos/${item.projectId}?tab=techs`,
    })),
  ];

  const page = items.slice(skip, skip + take);
  return NextResponse.json({
    items: page,
    total: items.length,
    nextSkip: skip + page.length,
    hasMore: skip + page.length < items.length,
  });
}
