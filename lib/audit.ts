import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function recordAudit(input: {
  action: string;
  entityType: string;
  entityId: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}) {
  const [user, requestHeaders] = await Promise.all([getCurrentUser(), headers()]);
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();

  await prisma.auditEvent.create({
    data: {
      actorUserId: user?.id ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary ?? null,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      ipAddress: forwardedFor ?? requestHeaders.get("x-real-ip"),
    },
  });
}

export async function notify(input: {
  userId?: string | null;
  type: string;
  title: string;
  message: string;
  href?: string;
  severity?: string;
}) {
  return prisma.notification.create({
    data: {
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      href: input.href ?? null,
      severity: input.severity ?? "info",
    },
  });
}
