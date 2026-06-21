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

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = clean(searchParams.get("status"));
  const q = clean(searchParams.get("q"));

  const messages = await prisma.emailMessage.findMany({
    where: {
      userId: user.id,
      ...(status && status !== "all" ? { status } : {}),
      ...(q
        ? {
            OR: [
              { to: { contains: q, mode: "insensitive" } },
              { subject: { contains: q, mode: "insensitive" } },
              { body: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 80,
  });

  return NextResponse.json({ items: messages });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  if (intent !== "send") {
    const draft = await prisma.emailMessage.create({
      data: {
        userId: user.id,
        to,
        subject,
        body: text,
        status: "draft",
        source: "manual",
      },
    });

    return NextResponse.json(draft, { status: 201 });
  }

  const message = await prisma.emailMessage.create({
    data: {
      userId: user.id,
      to,
      subject,
      body: text,
      status: "sending",
      source: "manual",
    },
  });

  try {
    const result = await sendEmail({ to, subject, text });
    const sent = await prisma.emailMessage.update({
      where: { id: message.id },
      data: {
        status: "sent",
        resendId: result?.id ?? null,
        sentAt: new Date(),
        error: null,
      },
    });

    return NextResponse.json(sent, { status: 201 });
  } catch (error) {
    const failed = await prisma.emailMessage.update({
      where: { id: message.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : "No se pudo enviar el correo.",
      },
    });

    return NextResponse.json(failed, { status: 502 });
  }
}
