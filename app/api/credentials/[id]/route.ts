import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptString } from "@/lib/crypto";
import { invalidateCache } from "@/lib/server-cache";

const MASKED_SECRET = "************";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
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
    invalidateCache(`project:${credential.projectId}`);
    invalidateCache("credentials");
    invalidateCache("vault");

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
    const { id } = await params;
    const credential = await prisma.credential.delete({
      where: { id },
      select: { projectId: true },
    });
    invalidateCache(`project:${credential.projectId}`);
    invalidateCache("credentials");
    invalidateCache("vault");
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete credential" }, { status: 500 });
  }
}
