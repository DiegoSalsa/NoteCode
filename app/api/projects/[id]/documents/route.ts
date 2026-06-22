import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";
import { uploadDocumentFile } from "@/lib/storage";

const MAX_FILE_SIZE = 12 * 1024 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const category = String(formData.get("category") || "General").trim() || "General";
    const customName = String(formData.get("name") || "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "El documento supera el máximo de 12 MB." }, { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const storedFile = await uploadDocumentFile({
      bytes,
      contentType: file.type || "application/octet-stream",
      fileName: customName || file.name,
    });

    const document = await prisma.document.create({
      data: {
        name: customName || file.name,
        category,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        projectId: id,
        fileData: storedFile ? null : bytes,
        storagePath: storedFile?.path ?? null,
        storageBucket: storedFile?.bucket ?? null,
      },
      select: {
        id: true,
        name: true,
        category: true,
        mimeType: true,
        size: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    invalidateCache(`project:${id}`);
    invalidateCache("documents");
    return NextResponse.json(document, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to upload project document" }, { status: 500 });
  }
}
