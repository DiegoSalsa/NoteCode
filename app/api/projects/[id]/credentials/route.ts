import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptString } from "@/lib/crypto";

const MASKED_SECRET = "************";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const items = await prisma.credential.findMany({
      where: { projectId: id },
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
    const { id } = await params;
    const body = await request.json();
    const item = await prisma.credential.create({
      data: {
        projectId: id,
        name: body.name || body.title,
        username: body.username,
        secretData: encryptString(body.password),
      },
      select: {
        id: true,
        name: true,
        username: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      {
        ...item,
        title: item.name,
        service: "Proyecto",
        password: MASKED_SECRET,
        url: null,
        notes: null,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
