import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { getCurrentUser } from "@/lib/auth";
import { findAccessibleProject } from "@/lib/personal-workspace";
import { recordAudit } from "@/lib/audit";
import { assertVersion, ConflictError, nextVersion } from "@/lib/concurrency";
import { logEvent } from "@/lib/log";

const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["Por hacer", "En progreso", "Bloqueado", "Hecho"]).optional(),
  priority: z.enum(["Baja", "Media", "Alta"]).optional(),
  dueDate: z.string().trim().optional().nullable(),
  clientVisible: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  version: z.number().int().optional(),
});

function parseDueDate(value: string | null | undefined) {
  if (value === undefined) return undefined;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id, taskId } = await params;
    if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    const body = taskPatchSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json({ error: "Invalid task payload" }, { status: 400 });
    }

    const current = await prisma.projectTask.findFirst({
      where: { id: taskId, projectId: id, deletedAt: null },
    });
    if (!current) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    assertVersion(current.version, body.data.version);

    const task = await prisma.projectTask.update({
      where: { id: taskId },
      data: {
        title: body.data.title,
        description: body.data.description,
        status: body.data.status,
        priority: body.data.priority,
        dueDate: parseDueDate(body.data.dueDate),
        clientVisible: body.data.clientVisible,
        sortOrder: body.data.sortOrder,
        version: nextVersion(current.version),
      },
    });

    invalidateCache(`project:${id}`);
    invalidateCache("erp:");
    await recordAudit({ action: "update", entityType: "task", entityId: task.id, summary: `Tarea actualizada: ${task.title}` });
    return NextResponse.json(task);
  } catch (error) {
    if (error instanceof ConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    logEvent("error", "tasks.update", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "No se pudo actualizar la tarea." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id, taskId } = await params;
    if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    const result = await prisma.projectTask.updateMany({
      where: { id: taskId, projectId: id, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: user.id },
    });
    if (result.count === 0) return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });

    invalidateCache(`project:${id}`);
    invalidateCache("erp:");
    await recordAudit({ action: "delete", entityType: "task", entityId: taskId, summary: "Tarea enviada a papelera" });
    return NextResponse.json({ success: true, recoverable: true });
  } catch (error) {
    logEvent("error", "tasks.delete", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "No se pudo eliminar la tarea." }, { status: 500 });
  }
}
