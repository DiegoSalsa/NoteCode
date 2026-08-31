import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const scope = new URL(request.url).searchParams.get("scope") || "global";
  const row = await prisma.viewPreference.findUnique({ where: { userId_scope: { userId: user.id, scope } } });
  return NextResponse.json(row?.value ?? {});
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await request.json() as { scope?: string; value?: unknown };
  const scope = body.scope || "global";
  const row = await prisma.viewPreference.upsert({
    where: { userId_scope: { userId: user.id, scope } },
    update: { value: body.value ?? {} },
    create: { userId: user.id, scope, value: body.value ?? {} },
  });
  return NextResponse.json(row.value);
}
