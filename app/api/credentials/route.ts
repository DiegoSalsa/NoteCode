import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptString } from "@/lib/crypto";

const MASKED_SECRET = "************";

export async function GET() {
  try {
    const credentials = await prisma.credential.findMany({
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
    });

    return NextResponse.json(
      credentials.map((credential) => ({
        ...credential,
        title: credential.name,
        service: credential.project.name,
        clientName: credential.project.client.name,
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
    const body = await request.json();

    if (!body.projectId || !body.username || !body.password || !(body.name || body.title)) {
      return NextResponse.json(
        { error: "projectId, name, username and password are required" },
        { status: 400 },
      );
    }

    const credential = await prisma.credential.create({
      data: {
        projectId: body.projectId,
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

    return NextResponse.json({ ...credential, password: MASKED_SECRET }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create credential" }, { status: 500 });
  }
}
