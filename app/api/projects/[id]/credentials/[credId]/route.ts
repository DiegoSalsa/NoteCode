import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; credId: string }> },
) {
  try {
    const { id, credId } = await params;
    await prisma.credential.delete({
      where: {
        id: credId,
        projectId: id,
      },
    });
    invalidateCache(`project:${id}`);
    invalidateCache("credentials");
    invalidateCache("vault");

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
