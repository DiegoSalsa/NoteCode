import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { sendPushToAll, sendPushToUser } from "@/lib/push";

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
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      href: input.href ?? null,
      severity: input.severity ?? "info",
    },
  });
  const payload = {
    title: notification.title,
    body: notification.message,
    url: notification.href ?? "/notificaciones",
    tag: `${notification.type}:${notification.id}`,
    severity: notification.severity,
  };

  try {
    const push = notification.userId ? sendPushToUser(notification.userId, payload) : sendPushToAll(payload);
    await Promise.race([
      push,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Push timeout after 3 seconds.")), 3000)),
    ]);
  } catch (error) {
    console.error("[push:notify]", error);
  }

  return notification;
}
