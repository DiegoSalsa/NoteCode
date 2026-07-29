import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { downloadDocumentFile } from "@/lib/storage";
import { attachmentContentDisposition, documentFileName } from "@/lib/document-files";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string; id: string }> },
) {
  const { token, id } = await params;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const access = await prisma.clientPortalToken.findUnique({ where: { tokenHash } });
  if (!access || access.revokedAt || (access.expiresAt && access.expiresAt < new Date())) {
    return NextResponse.json({ error: "Acceso inválido." }, { status: 404 });
  }

  const document = await prisma.document.findFirst({
    where: {
      id,
      deletedAt: null,
      clientVisible: true,
      project: {
        clientId: access.clientId,
        deletedAt: null,
        ...(access.projectId ? { id: access.projectId } : {}),
      },
    },
    select: { name: true, mimeType: true, fileData: true, storagePath: true, storageBucket: true },
  });
  if (!document) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });

  const bytes = document.storagePath
    ? await downloadDocumentFile({ path: document.storagePath, bucket: document.storageBucket || "documents" })
    : document.fileData;
  if (!bytes) return NextResponse.json({ error: "Archivo no disponible." }, { status: 404 });

  return new Response(bytes, {
    headers: {
      "Content-Type": document.mimeType,
      "Content-Disposition": attachmentContentDisposition(documentFileName(document.name, document.mimeType)),
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=60",
    },
  });
}
