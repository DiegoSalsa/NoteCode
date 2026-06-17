import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/server-cache";

const DEFAULT_TAKE = 25;
const MAX_TAKE = 50;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    const skip = Math.max(0, Number(searchParams.get("skip") ?? "0") || 0);
    const take = Math.min(MAX_TAKE, Math.max(1, Number(searchParams.get("take") ?? DEFAULT_TAKE) || DEFAULT_TAKE));
    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { client: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {};
    const cacheKey = `projects:init:${q}:${skip}:${take}`;
    const data = await cached(cacheKey, 30_000, async () => {
      const [projects, clients, total] = await Promise.all([
        prisma.project.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take,
          select: {
            id: true,
            name: true,
            description: true,
            status: true,
            agreedAmount: true,
            clientId: true,
            createdAt: true,
            updatedAt: true,
            client: { select: { id: true, name: true } },
          },
        }),
        prisma.client.findMany({
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true },
        }),
        prisma.project.count({ where }),
      ]);

      return {
        projects,
        clients,
        nextSkip: skip + projects.length,
        hasMore: skip + projects.length < total,
        total,
      };
    });

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to load projects" }, { status: 500 });
  }
}
