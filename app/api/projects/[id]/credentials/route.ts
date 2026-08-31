import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CURRENT_KEY_VERSION, encryptString } from "@/lib/crypto";
import { invalidateCache } from "@/lib/server-cache";
import { getCurrentUser } from "@/lib/auth";
import { findAccessibleProject } from "@/lib/personal-workspace";
import { jsonWithIdempotency } from "@/lib/idempotency-server";
import { encodeVaultSecret } from "@/lib/secret-payload";
import { recordAudit } from "@/lib/audit";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const MASKED_SECRET = "************";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    const items = await prisma.credential.findMany({
      where: { projectId: id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        username: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const safe = items.map((credential) => ({
      ...credential,
      title: credential.name,
      service: "Proyecto",
      password: MASKED_SECRET,
      url: null,
      notes: null,
    }));

    return NextResponse.json(safe);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;
    if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    const limited = rateLimit(clientKey(request, "credential-write"), 20, 60_000);
    if (!limited.ok) return NextResponse.json({ error: "Demasiados intentos. Espera un momento." }, { status: 429 });
    const body = await request.json();
    if (!body.username || !body.password || !(body.name || body.title)) {
      return NextResponse.json({ error: "Nombre, usuario y secreto son obligatorios." }, { status: 400 });
    }
    return jsonWithIdempotency(request, user.id, async () => {
    const item = await prisma.credential.create({
      data: {
        projectId: id,
        name: body.name || body.title,
        username: body.username,
        secretData: encryptString(encodeVaultSecret({ password: body.password, url: body.url, notes: body.notes })),
        keyVersion: CURRENT_KEY_VERSION,
      },
      select: {
        id: true,
        name: true,
        username: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    invalidateCache(`project:${id}`);
    invalidateCache("credentials");
    invalidateCache("vault");
    await recordAudit({ action: "create", entityType: "credential", entityId: item.id, summary: "Credencial creada" });

    return {
      status: 201,
      body: {
        ...item,
        title: item.name,
        service: "Proyecto",
        password: MASKED_SECRET,
        url: null,
        notes: null,
      },
    };
    });
  } catch {
    return NextResponse.json({ error: "No se pudo crear la credencial." }, { status: 500 });
  }
}
