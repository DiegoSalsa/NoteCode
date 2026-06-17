import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/server-cache";

export async function GET() {
  try {
    const data = await cached("projects:init", 30_000, async () => {
      const [projects, clients] = await Promise.all([
        prisma.project.findMany({
          orderBy: { updatedAt: "desc" },
          include: { client: { select: { id: true, name: true } } },
        }),
        prisma.client.findMany({
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true },
        }),
      ]);

      return { projects, clients };
    });

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to load projects" }, { status: 500 });
  }
}
