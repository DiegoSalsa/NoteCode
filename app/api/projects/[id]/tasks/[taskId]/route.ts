import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { getCurrentUser } from "@/lib/auth";
import { findAccessibleProject } from "@/lib/personal-workspace";

const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["Por hacer", "En progreso", "Bloqueado", "Hecho"]).optional(),
  priority: z.enum(["Baja", "Media", "Alta"]).optional(),
  dueDate: z.string().trim().optional().nullable(),
  clientVisible: z.boolean().optional(),
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
      where: { id: taskId, projectId: id },
      select: { id: true },
    });
    if (!current) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    const task = await prisma.projectTask.update({
      where: { id: taskId },
      data: {
        title: body.data.title,
        description: body.data.description,
        status: body.data.status,
        priority: body.data.priority,
        dueDate: parseDueDate(body.data.dueDate),
        clientVisible: body.data.clientVisible,
      },
    });

    invalidateCache(`project:${id}`);
    invalidateCache("erp:");
    return NextResponse.json(task);
  } catch {
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
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
    const result = await prisma.projectTask.deleteMany({
      where: { id: taskId, projectId: id },
    });
    if (result.count === 0) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    invalidateCache(`project:${id}`);
    invalidateCache("erp:");
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
