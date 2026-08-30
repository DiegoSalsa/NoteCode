import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptString } from "@/lib/crypto";
import { cached, invalidateCache } from "@/lib/server-cache";
import { getCurrentUser } from "@/lib/auth";
import { findAccessibleProject, COMPANY_VISIBILITY, PERSONAL_VISIBILITY } from "@/lib/personal-workspace";

const MASKED_SECRET = "************";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const credentials = await cached(`credentials:${user.id}`, 30_000, async () => prisma.credential.findMany({
      where: {
        deletedAt: null,
        OR: [
          { projectId: null },
          { project: { visibility: COMPANY_VISIBILITY } },
          { project: { visibility: PERSONAL_VISIBILITY, personalOwnerId: user.id } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        projectId: true,
        name: true,
        username: true,
        createdAt: true,
        updatedAt: true,
        project: {
          select: {
            name: true,
            client: { select: { name: true } },
          },
        },
      },
    }));

    return NextResponse.json(
      credentials.map((credential) => ({
        ...credential,
        title: credential.name,
        service: credential.project?.name ?? "General empresa",
        clientName: credential.project?.client?.name ?? "Empresa",
        url: null,
        notes: null,
        password: MASKED_SECRET,
      })),
    );
  } catch {
    return NextResponse.json({ error: "Failed to fetch credentials" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const body = await request.json();

    if (!body.username || !body.password || !(body.name || body.title)) {
      return NextResponse.json(
        { error: "name, username and password are required" },
        { status: 400 },
      );
    }

    if (body.projectId && !await findAccessibleProject(body.projectId, user.id)) {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }
    const credential = await prisma.credential.create({
      data: {
        projectId: body.projectId || null,
        name: body.name || body.title,
        username: body.username,
        secretData: encryptString(body.password),
      },
      select: {
        id: true,
        projectId: true,
        name: true,
        username: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (credential.projectId) invalidateCache(`project:${credential.projectId}`);
    invalidateCache("credentials");
    invalidateCache("vault");
    invalidateCache("dashboard:");

    return NextResponse.json({ ...credential, password: MASKED_SECRET }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create credential" }, { status: 500 });
  }
}
