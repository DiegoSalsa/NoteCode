import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptString } from "@/lib/crypto";
import { invalidateCache } from "@/lib/server-cache";
import { getCurrentUser } from "@/lib/auth";
import { findAccessibleProject } from "@/lib/personal-workspace";

const MASKED_SECRET = "************";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    const items = await prisma.credential.findMany({
      where: { projectId: id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        username: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const safe = items.map((credential) => ({
      ...credential,
      title: credential.name,
      service: "Proyecto",
      password: MASKED_SECRET,
      url: null,
      notes: null,
    }));

    return NextResponse.json(safe);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    const body = await request.json();
    const item = await prisma.credential.create({
      data: {
        projectId: id,
        name: body.name || body.title,
        username: body.username,
        secretData: encryptString(body.password),
      },
      select: {
        id: true,
        name: true,
        username: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    invalidateCache(`project:${id}`);
    invalidateCache("credentials");
    invalidateCache("vault");

    return NextResponse.json(
      {
        ...item,
        title: item.name,
        service: "Proyecto",
        password: MASKED_SECRET,
        url: null,
        notes: null,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
