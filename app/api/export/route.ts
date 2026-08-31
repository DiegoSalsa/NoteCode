import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, hasRecentWebAuthn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_VISIBILITY, PERSONAL_VISIBILITY } from "@/lib/personal-workspace";
import { createExportManifest, noteToMarkdown, toCsv } from "@/lib/export";
import { decodeVaultSecret } from "@/lib/secret-payload";
import { decryptString } from "@/lib/crypto";
import { recordAudit } from "@/lib/audit";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const limited = rateLimit(clientKey(request, "export"), 8, 60_000);
  if (!limited.ok) return NextResponse.json({ error: "Demasiadas exportaciones." }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") === "project" ? "project" : "workspace";
  const projectId = searchParams.get("projectId") || undefined;
  const format = searchParams.get("format") || "json";
  const includeSecrets = searchParams.get("includeSecrets") === "1";
  if (includeSecrets && !(await hasRecentWebAuthn(user.id))) {
    return NextResponse.json({ error: "Reautenticación requerida para exportar la bóveda." }, { status: 403 });
  }

  const projectWhere = {
    deletedAt: null,
    OR: [
      { visibility: COMPANY_VISIBILITY },
      { visibility: PERSONAL_VISIBILITY, personalOwnerId: user.id },
    ],
    ...(scope === "project" && projectId ? { id: projectId } : {}),
  };

  const [projects, notes, documents, requirements, tasks, techs, decisions, risks, milestones, credentials] = await Promise.all([
    prisma.project.findMany({ where: projectWhere }),
    prisma.note.findMany({
      where: {
        deletedAt: null,
        OR: [{ visibility: COMPANY_VISIBILITY }, { visibility: PERSONAL_VISIBILITY, personalOwnerId: user.id }],
        ...(scope === "project" && projectId ? { projectId } : {}),
      },
    }),
    prisma.document.findMany({
      where: { deletedAt: null, ...(scope === "project" && projectId ? { projectId } : { OR: [{ projectId: null }, { project: projectWhere }] }) },
      select: { id: true, name: true, category: true, mimeType: true, size: true },
    }),
    prisma.projectRequirement.findMany({ where: { deletedAt: null, project: projectWhere } }),
    prisma.projectTask.findMany({ where: { deletedAt: null, project: projectWhere } }),
    prisma.projectTech.findMany({ where: { deletedAt: null, project: projectWhere } }),
    prisma.projectDecision.findMany({ where: { deletedAt: null, project: projectWhere } }),
    prisma.projectRisk.findMany({ where: { deletedAt: null, project: projectWhere } }),
    prisma.projectMilestone.findMany({ where: { deletedAt: null, project: projectWhere } }),
    prisma.credential.findMany({
      where: { deletedAt: null, OR: [{ projectId: null }, { project: projectWhere }] },
      select: { id: true, name: true, username: true, projectId: true, secretData: includeSecrets },
    }),
  ]);

  await recordAudit({
    action: "export",
    entityType: scope === "project" ? "project" : "workspace",
    entityId: projectId || user.id,
    summary: includeSecrets ? "Exportación con bóveda" : "Exportación sin secretos",
  });

  if (format === "csv") {
    const csv = toCsv(tasks.map((task) => ({ title: task.title, status: task.status, priority: task.priority, projectId: task.projectId })));
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=notecode-tareas.csv" } });
  }
  if (format === "markdown") {
    const markdown = notes.map((note) => noteToMarkdown(note)).join("\n---\n");
    return new NextResponse(markdown, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": "attachment; filename=notecode-notas.md" } });
  }

  const payload = {
    manifest: createExportManifest({ scope, projectId, includeSecrets }),
    projects,
    notes,
    documents,
    requirements,
    tasks,
    techs,
    decisions,
    risks,
    milestones,
    credentials: includeSecrets
      ? credentials.map((credential) => {
          const secret = credential.secretData
            ? decodeVaultSecret(decryptString(credential.secretData))
            : { password: null, url: null, notes: null };
          return { id: credential.id, name: credential.name, username: credential.username, projectId: credential.projectId, password: secret.password, url: secret.url ?? null, notes: secret.notes ?? null };
        })
      : credentials.map(({ id, name, username, projectId: credProjectId }) => ({ id, name, username, projectId: credProjectId })),
  };

  return NextResponse.json(payload);
}
