import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { deleteDocumentFile, downloadDocumentFile } from "@/lib/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const document = await prisma.document.findUnique({
      where: { id },
      select: {
        name: true,
        mimeType: true,
        fileData: true,
        storagePath: true,
        storageBucket: true,
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const fileBytes = document.storagePath
      ? await downloadDocumentFile({
          path: document.storagePath,
          bucket: document.storageBucket || "documents",
        })
      : document.fileData;

    if (!fileBytes) {
      return NextResponse.json({ error: "Document file not found" }, { status: 404 });
    }

    return new Response(fileBytes, {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(document.name)}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to download document" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
    const document = await prisma.document.findUnique({
      where: { id },
      select: { storagePath: true, storageBucket: true, projectId: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    await prisma.document.delete({ where: { id } });
    if (document.storagePath) {
      await deleteDocumentFile({
        path: document.storagePath,
        bucket: document.storageBucket || "documents",
      });
    }
    invalidateCache("documents");
    if (document.projectId) {
      invalidateCache(`project:${document.projectId}`);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
