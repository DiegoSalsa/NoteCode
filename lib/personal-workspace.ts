import { prisma } from "@/lib/prisma";

export const COMPANY_VISIBILITY = "COMPANY";
export const PERSONAL_VISIBILITY = "PERSONAL";

/**
 * Política de acceso (decisión de los propietarios, 2026-08-31):
 * NoteCode lo operan los dos dueños de la empresa. Cualquier usuario
 * autenticado y activo puede ver y trabajar los proyectos COMPANY.
 * Los proyectos PERSONAL siguen aislados a su personalOwnerId.
 * La tabla project_members existe por si más adelante hay colaboradores
 * externos; no se usa como ACL mientras el equipo sea solo los dueños.
 */
export const COMPANY_PROJECTS_SHARED_WITH_STAFF = true;

export type WorkspaceScope = "company" | "personal";

export function workspaceScope(value: string | null | undefined): WorkspaceScope {
  return value?.toLowerCase() === "personal" ? "personal" : "company";
}

export function projectAccessWhere(projectId: string, userId: string) {
  return {
    id: projectId,
    deletedAt: null,
    OR: [
      { visibility: COMPANY_VISIBILITY },
      { visibility: PERSONAL_VISIBILITY, personalOwnerId: userId },
    ],
  };
}

export async function findAccessibleProject(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: projectAccessWhere(projectId, userId),
    select: {
      id: true,
      visibility: true,
      personalOwnerId: true,
      status: true,
      clientId: true,
    },
  });
}

export function isPersonalProject(project: { visibility: string }) {
  return project.visibility === PERSONAL_VISIBILITY;
}

export function personalNotesWhere(userId: string) {
  return { visibility: PERSONAL_VISIBILITY, personalOwnerId: userId };
}
