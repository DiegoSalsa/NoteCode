import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const intent = clean(body.intent) || "draft";
  const to = clean(body.to);
  const subject = clean(body.subject);
  const text = clean(body.body);

  if (!to || !isValidEmail(to)) {
    return NextResponse.json({ error: "Ingresa un destinatario valido." }, { status: 400 });
  }

  if (!subject || !text) {
    return NextResponse.json({ error: "Asunto y cuerpo son obligatorios." }, { status: 400 });
  }

  const current = await prisma.emailMessage.findFirst({ where: { id, userId: user.id } });
  if (!current) return NextResponse.json({ error: "Correo no encontrado." }, { status: 404 });

  if (intent !== "send") {
    const draft = await prisma.emailMessage.update({
      where: { id },
      data: {
        to,
        subject,
        body: text,
        status: "draft",
        error: null,
      },
    });

    return NextResponse.json(draft);
  }

  await prisma.emailMessage.update({
    where: { id },
    data: {
      to,
      subject,
      body: text,
      status: "sending",
      error: null,
    },
  });

  try {
    const result = await sendEmail({ to, subject, text });
    const sent = await prisma.emailMessage.update({
      where: { id },
      data: {
        status: "sent",
        resendId: result?.id ?? null,
        sentAt: new Date(),
      },
    });

    return NextResponse.json(sent);
  } catch (error) {
    const failed = await prisma.emailMessage.update({
      where: { id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "No se pudo enviar el correo.",
      },
    });

    return NextResponse.json(failed, { status: 502 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await prisma.emailMessage.deleteMany({ where: { id, userId: user.id } });

  return NextResponse.json({ ok: true });
}
