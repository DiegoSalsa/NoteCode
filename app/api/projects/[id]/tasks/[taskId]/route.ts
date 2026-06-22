import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";

const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["Por hacer", "En progreso", "Bloqueado", "Hecho"]).optional(),
  priority: z.enum(["Baja", "Media", "Alta"]).optional(),
  dueDate: z.string().trim().optional().nullable(),
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
    const { id, taskId } = await params;
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
      },
    });

    invalidateCache(`project:${id}`);
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
    const { id, taskId } = await params;
    const result = await prisma.projectTask.deleteMany({
      where: { id: taskId, projectId: id },
    });
    if (result.count === 0) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    invalidateCache(`project:${id}`);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
