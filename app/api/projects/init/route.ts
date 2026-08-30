import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/server-cache";
import { getCurrentUser } from "@/lib/auth";
import { COMPANY_VISIBILITY, PERSONAL_VISIBILITY, workspaceScope } from "@/lib/personal-workspace";

const DEFAULT_TAKE = 25;
const MAX_TAKE = 50;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    const scope = workspaceScope(searchParams.get("scope"));
    const skip = Math.max(0, Number(searchParams.get("skip") ?? "0") || 0);
    const take = Math.min(MAX_TAKE, Math.max(1, Number(searchParams.get("take") ?? DEFAULT_TAKE) || DEFAULT_TAKE));
    const scopeWhere = scope === "personal"
      ? { visibility: PERSONAL_VISIBILITY, personalOwnerId: user.id }
      : { visibility: COMPANY_VISIBILITY };
    const where = q
      ? {
          deletedAt: null,
          ...scopeWhere,
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { client: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : { deletedAt: null, ...scopeWhere };
    const cacheKey = `projects:init:${scope}:${scope === "personal" ? `${user.id}:` : ""}${q}:${skip}:${take}`;
    const data = await cached(cacheKey, 30_000, async () => {
      const [projects, clients, team, total] = await Promise.all([
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
            budgetHours: true,
            budgetCost: true,
            startDate: true,
            targetDate: true,
            ownerId: true,
            clientId: true,
            createdAt: true,
            updatedAt: true,
            client: { select: { id: true, name: true } },
          },
        }),
        prisma.client.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true },
        }),
        prisma.teamMember.findMany({
          where: { active: true, deletedAt: null },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.project.count({ where }),
      ]);

      return {
        projects,
        clients,
        team,
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
