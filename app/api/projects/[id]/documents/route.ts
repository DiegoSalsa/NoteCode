import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { uploadDocumentFile } from "@/lib/storage";
import { documentFileName } from "@/lib/document-files";
import { canManage, getCurrentUser } from "@/lib/auth";
import { findAccessibleProject, isPersonalProject } from "@/lib/personal-workspace";

const MAX_FILE_SIZE = 12 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;

    const project = await findAccessibleProject(id, user.id);

    if (!project) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const category = String(formData.get("category") || "General").trim() || "General";
    const customName = String(formData.get("name") || "").trim();
    const wantsClientVisible = String(formData.get("clientVisible") || "") === "true";
    const clientVisible = !isPersonalProject(project) && canManage(user) && wantsClientVisible;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "El documento supera el máximo de 12 MB." }, { status: 413 });
    }
    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: "Tipo de archivo no permitido." }, { status: 415 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const name = documentFileName(customName || file.name, file.type || "application/octet-stream", file.name);
    const storedFile = await uploadDocumentFile({
      bytes,
      contentType: file.type || "application/octet-stream",
      fileName: name,
    });

    const document = await prisma.document.create({
      data: {
        name,
        category,
        mimeType,
        size: file.size,
        projectId: id,
        fileData: storedFile ? null : bytes,
        storagePath: storedFile?.path ?? null,
        storageBucket: storedFile?.bucket ?? null,
        clientVisible,
      },
      select: {
        id: true,
        name: true,
        category: true,
        mimeType: true,
        size: true,
        clientVisible: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    invalidateCache(`project:${id}`);
    invalidateCache("erp:");
    invalidateCache("documents");
    return NextResponse.json(document, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to upload project document" }, { status: 500 });
  }
}
