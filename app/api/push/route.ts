import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPushConfiguration, sendPushToUser } from "@/lib/push";
import { cached, invalidateCache } from "@/lib/server-cache";

type SubscriptionInput = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const [configuration, count] = await Promise.all([
    Promise.resolve(getPushConfiguration()),
    cached(`push:status:${user.id}`, 30_000, () =>
      prisma.pushSubscription.count({ where: { userId: user.id } })),
  ]);

  return NextResponse.json({ ...configuration, subscribed: count > 0, deviceCount: count });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json() as { action?: unknown; subscription?: SubscriptionInput };
  if (body.action === "test") {
    const result = await sendPushToUser(user.id, {
      title: "NoteCode está conectado",
      body: "Las notificaciones push funcionan correctamente en este dispositivo.",
      url: "/notificaciones",
      tag: "push-test",
      severity: "success",
    });
    return NextResponse.json(result, { status: result.sent > 0 ? 200 : 409 });
  }

  const configuration = getPushConfiguration();
  if (!configuration.configured) {
    return NextResponse.json({ error: "Las claves VAPID todavía no están configuradas." }, { status: 503 });
  }

  const subscription = body.subscription;
  const endpoint = typeof subscription?.endpoint === "string" ? subscription.endpoint.trim() : "";
  const p256dh = typeof subscription?.keys?.p256dh === "string" ? subscription.keys.p256dh.trim() : "";
  const auth = typeof subscription?.keys?.auth === "string" ? subscription.keys.auth.trim() : "";
  if (!endpoint.startsWith("https://") || !p256dh || !auth) {
    return NextResponse.json({ error: "La suscripción push no es válida." }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: {
      userId: user.id,
      p256dh,
      auth,
      userAgent: request.headers.get("user-agent"),
    },
    create: {
      userId: user.id,
      endpoint,
      p256dh,
      auth,
      userAgent: request.headers.get("user-agent"),
    },
  });
  invalidateCache(`push:status:${user.id}`);

  const result = await sendPushToUser(user.id, {
    title: "Notificaciones activadas",
    body: "NoteCode ya puede avisarte sobre cobros, aprobaciones, soporte y vencimientos.",
    url: "/notificaciones",
    tag: "push-enabled",
    severity: "success",
  });
  return NextResponse.json({ subscribed: true, ...result });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as { endpoint?: unknown };
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  await prisma.pushSubscription.deleteMany({
    where: { userId: user.id, ...(endpoint ? { endpoint } : {}) },
  });
  invalidateCache(`push:status:${user.id}`);

  return NextResponse.json({ subscribed: false });
}
