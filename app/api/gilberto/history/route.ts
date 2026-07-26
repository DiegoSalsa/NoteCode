import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cached, invalidateCache } from "@/lib/server-cache";

const historySchema = z.object({
  threadId: z.string().uuid().optional().nullable(),
  messages: z.array(z.object({
    id: z.string().min(1).max(200),
    role: z.enum(["user", "assistant", "system"]),
    parts: z.array(z.unknown()).max(100),
  })).max(100),
});

function textFromParts(parts: unknown[]) {
  return parts
    .filter((part): part is { type: string; text?: string } => Boolean(part && typeof part === "object" && "type" in part))
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .slice(0, 20_000);
}

async function defaultThread(userId: string) {
  const existing = await prisma.assistantThread.findFirst({
    where: { userId, isDefault: true, archivedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;

  try {
    return await prisma.assistantThread.create({
      data: { userId, isDefault: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.assistantThread.findFirst({
        where: { userId, isDefault: true, archivedAt: null },
      });
      if (raced) return raced;
    }
    throw error;
  }
}

async function threadPayload(userId: string, requestedThreadId?: string | null) {
  const thread = requestedThreadId
    ? await prisma.assistantThread.findFirst({ where: { id: requestedThreadId, userId, archivedAt: null } })
    : await defaultThread(userId);
  if (!thread) return null;
  const [messages, threads] = await Promise.all([
    prisma.assistantMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.assistantThread.findMany({
      where: { userId, archivedAt: null },
      orderBy: [{ isDefault: "desc" }, { lastMessageAt: "desc" }, { createdAt: "desc" }],
      take: 30,
      select: { id: true, title: true, isDefault: true, lastMessageAt: true, createdAt: true },
    }),
  ]);

  return {
    threadId: thread.id,
    title: thread.title,
    threads,
    messages: messages.map((message) => ({
      id: message.id.startsWith(`${thread.id}:`) ? message.id.slice(thread.id.length + 1) : message.id,
      role: message.role,
      parts: message.parts,
    })),
  };
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const requestedThreadId = new URL(request.url).searchParams.get("threadId");
  const payload = await cached(
    `gilberto:history:${user.id}:${requestedThreadId ?? "default"}`,
    30_000,
    () => threadPayload(user.id, requestedThreadId),
  );
  if (!payload) return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });
  return NextResponse.json(payload);
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const thread = await prisma.$transaction(async (tx) => {
    await tx.assistantThread.updateMany({ where: { userId: user.id, isDefault: true }, data: { isDefault: false } });
    return tx.assistantThread.create({ data: { userId: user.id, isDefault: true } });
  });
  invalidateCache(`gilberto:history:${user.id}:`);
  const payload = await threadPayload(user.id, thread.id);
  return NextResponse.json(payload, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = z.object({ threadId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Conversación inválida." }, { status: 400 });

  const thread = await prisma.assistantThread.findFirst({ where: { id: parsed.data.threadId, userId: user.id, archivedAt: null } });
  if (!thread) return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });
  await prisma.$transaction([
    prisma.assistantThread.updateMany({ where: { userId: user.id, isDefault: true }, data: { isDefault: false } }),
    prisma.assistantThread.update({ where: { id: thread.id }, data: { isDefault: true } }),
  ]);
  invalidateCache(`gilberto:history:${user.id}:`);
  return NextResponse.json(await threadPayload(user.id, thread.id));
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = historySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Historial inválido." }, { status: 400 });
  }

  const thread = parsed.data.threadId
    ? await prisma.assistantThread.findFirst({ where: { id: parsed.data.threadId, userId: user.id, archivedAt: null } })
    : await defaultThread(user.id);
  if (!thread) return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });

  const messages = parsed.data.messages.slice(-100);
  const firstUserText = messages.find((message) => message.role === "user")
    ? textFromParts(messages.find((message) => message.role === "user")!.parts)
    : "";

  await prisma.$transaction([
    ...messages.map((message) => {
      const id = `${thread.id}:${message.id}`.slice(0, 300);
      const data = {
        threadId: thread.id,
        role: message.role,
        text: textFromParts(message.parts) || null,
        parts: message.parts as Prisma.InputJsonValue,
      };
      return prisma.assistantMessage.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
    }),
    prisma.assistantThread.update({
      where: { id: thread.id },
      data: {
        lastMessageAt: messages.length ? new Date() : thread.lastMessageAt,
        ...(thread.title === "Conversación principal" && firstUserText
          ? { title: firstUserText.slice(0, 80) }
          : {}),
      },
    }),
  ]);
  invalidateCache(`gilberto:history:${user.id}:`);

  return NextResponse.json({ success: true, threadId: thread.id, saved: messages.length });
}
