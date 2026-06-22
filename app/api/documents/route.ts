import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cached, invalidateCache } from "@/lib/server-cache";
import { uploadDocumentFile } from "@/lib/storage";

const DEFAULT_TAKE = 50;
const MAX_TAKE = 100;
const MAX_FILE_SIZE = 12 * 1024 * 1024;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    const category = searchParams.get("category")?.trim() || "";
    const skip = Math.max(0, Number(searchParams.get("skip") ?? "0") || 0);
    const take = Math.min(MAX_TAKE, Math.max(1, Number(searchParams.get("take") ?? DEFAULT_TAKE) || DEFAULT_TAKE));
    const where = {
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { category: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const data = await cached(`documents:${q}:${category}:${skip}:${take}`, 30_000, async () => {
      const [documents, total, categoryRows] = await Promise.all([
        prisma.document.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take,
          select: {
            id: true,
            name: true,
            category: true,
            mimeType: true,
            size: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.document.count({ where }),
        prisma.document.findMany({
          distinct: ["category"],
          orderBy: { category: "asc" },
          select: { category: true },
        }),
      ]);

      return {
        documents,
        categories: categoryRows.map((row) => row.category).filter(Boolean),
        nextSkip: skip + documents.length,
        hasMore: skip + documents.length < total,
        total,
      };
    });

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to load documents" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const category = String(formData.get("category") || "General").trim() || "General";
    const customName = String(formData.get("name") || "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "El documento supera el maximo de 12 MB." }, { status: 413 });
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

    invalidateCache("documents");
    return NextResponse.json(document, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to upload document" }, { status: 500 });
  }
}
