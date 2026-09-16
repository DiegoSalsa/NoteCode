import { findAccessibleProject } from "@/lib/personal-workspace";
import { prisma } from "@/lib/prisma";

export async function loadCompanySeoProject(projectId: string, userId: string) {
  const project = await findAccessibleProject(projectId, userId);
  if (!project || project.visibility !== "COMPANY") return null;
  const seoProject = await prisma.seoProject.findUnique({
    where: { projectId },
    include: {
      project: { select: { id: true, name: true, client: { select: { name: true } } } },
      gscProperty: { select: { hostname: true, siteUrl: true } },
    },
  });
  if (!seoProject) return { project, seoProject: null };
  return { project, seoProject };
}
