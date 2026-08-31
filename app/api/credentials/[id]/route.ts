import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptString } from "@/lib/crypto";
import { invalidateCache } from "@/lib/server-cache";
import { canManage, getCurrentUser } from "@/lib/auth";
import { findAccessibleProject } from "@/lib/personal-workspace";

const MASKED_SECRET = "************";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    const current = await prisma.credential.findFirst({ where: { id, deletedAt: null }, select: { projectId: true } });
    if (!current) return NextResponse.json({ error: "Credencial no encontrada" }, { status: 404 });
    if (current.projectId && !await findAccessibleProject(current.projectId, user.id)) {
      return NextResponse.json({ error: "Credencial no encontrada" }, { status: 404 });
    }
    if (!current.projectId && !canManage(user)) {
      return NextResponse.json({ error: "Credencial no encontrada" }, { status: 404 });
    }
    const data: {
      name?: string;
      username?: string;
      secretData?: string;
    } = {};

    if (body.name || body.title) data.name = body.name || body.title;
    if (body.username) data.username = body.username;
    if (body.password) data.secretData = encryptString(body.password);

    const credential = await prisma.credential.update({
      where: { id },
      data,
      select: {
        id: true,
        projectId: true,
        name: true,
        username: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (credential.projectId) invalidateCache(`project:${credential.projectId}`);
    invalidateCache("credentials");
    invalidateCache("vault");
    invalidateCache("dashboard:");

    return NextResponse.json({ ...credential, password: MASKED_SECRET });
  } catch {
    return NextResponse.json({ error: "Failed to update credential" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    const current = await prisma.credential.findFirst({ where: { id, deletedAt: null }, select: { projectId: true } });
    if (!current) return NextResponse.json({ error: "Credencial no encontrada" }, { status: 404 });
    if (current.projectId && !await findAccessibleProject(current.projectId, user.id)) {
      return NextResponse.json({ error: "Credencial no encontrada" }, { status: 404 });
    }
    if (!current.projectId && !canManage(user)) {
      return NextResponse.json({ error: "Credencial no encontrada" }, { status: 404 });
    }
    const credential = await prisma.credential.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { projectId: true },
    });
    if (credential.projectId) invalidateCache(`project:${credential.projectId}`);
    invalidateCache("credentials");
    invalidateCache("vault");
    invalidateCache("dashboard:");
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete credential" }, { status: 500 });
  }
}
