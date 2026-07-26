import { NextRequest, NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { canManage, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { downloadDocumentFile } from "@/lib/storage";
import { attachmentContentDisposition, documentFileName } from "@/lib/document-files";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    const document = await prisma.document.findFirst({
      where: { id, deletedAt: null },
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
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canManage(user)) return NextResponse.json({ error: "Sin permisos para eliminar documentos." }, { status: 403 });
    const { id } = await params;
    const document = await prisma.document.findFirst({
      where: { id, deletedAt: null },
      select: { name: true, storagePath: true, storageBucket: true, projectId: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    await prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
    invalidateCache("documents");
    if (document.projectId) {
      invalidateCache(`project:${document.projectId}`);
    }
    await recordAudit({
      action: "DELETE",
      entityType: "Document",
      entityId: id,
      summary: `Documento movido a papelera: ${document.name}`,
      metadata: { recoverable: true },
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
