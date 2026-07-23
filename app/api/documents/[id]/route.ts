import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { downloadDocumentFile } from "@/lib/storage";
import { attachmentContentDisposition, documentFileName } from "@/lib/document-files";

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

    const fileName = documentFileName(document.name, document.mimeType);

    return new Response(fileBytes, {
      headers: {
        "Content-Type": document.mimeType,
        "Content-Disposition": attachmentContentDisposition(fileName),
        "Content-Length": String(fileBytes.byteLength),
        "X-Content-Type-Options": "nosniff",
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

    await prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
    invalidateCache("documents");
    if (document.projectId) {
      invalidateCache(`project:${document.projectId}`);
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
