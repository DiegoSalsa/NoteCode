import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";

const taskSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["Por hacer", "En progreso", "Bloqueado", "Hecho"]).default("Por hacer"),
  priority: z.enum(["Baja", "Media", "Alta"]).default("Media"),
  dueDate: z.string().trim().optional().nullable(),
});

function parseDueDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const tasks = await prisma.projectTask.findMany({
      where: { projectId: id },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json(tasks);
  } catch {
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = taskSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json({ error: "Invalid task payload" }, { status: 400 });
    }

    const task = await prisma.projectTask.create({
      data: {
        projectId: id,
        title: body.data.title,
        description: body.data.description || null,
        status: body.data.status,
        priority: body.data.priority,
        dueDate: parseDueDate(body.data.dueDate),
      },
    });

    invalidateCache(`project:${id}`);
    return NextResponse.json(task, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
