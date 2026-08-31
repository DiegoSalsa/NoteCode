import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/server-cache";
import { canManage, getCurrentUser } from "@/lib/auth";
import { COMPANY_VISIBILITY, PERSONAL_VISIBILITY } from "@/lib/personal-workspace";

const MASKED_SECRET = "************";

const DEFAULT_TAKE = 50;
const MAX_TAKE = 100;

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() || "";
    const skip = Math.max(0, Number(searchParams.get("skip") ?? "0") || 0);
    const take = Math.min(MAX_TAKE, Math.max(1, Number(searchParams.get("take") ?? DEFAULT_TAKE) || DEFAULT_TAKE));
    const accessWhere = {
      deletedAt: null,
      OR: [
        ...(canManage(user) ? [{ projectId: null as string | null }] : []),
        { project: { visibility: COMPANY_VISIBILITY } },
        { project: { visibility: PERSONAL_VISIBILITY, personalOwnerId: user.id } },
      ],
    };
    const where = q
      ? {
          AND: [
            accessWhere,
            { OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { username: { contains: q, mode: "insensitive" as const } },
              { project: { name: { contains: q, mode: "insensitive" as const } } },
              { project: { client: { name: { contains: q, mode: "insensitive" as const } } } },
            ] },
          ],
        }
      : accessWhere;
    const data = await cached(`vault:${user.id}:${q}:${skip}:${take}`, 30_000, async () => {
      const [credentials, projects, total] = await Promise.all([
        prisma.credential.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip,
          take,
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
        }),
        prisma.project.findMany({
          where: { deletedAt: null, OR: [{ visibility: COMPANY_VISIBILITY }, { visibility: PERSONAL_VISIBILITY, personalOwnerId: user.id }] },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            name: true,
            client: { select: { name: true } },
          },
        }),
        prisma.credential.count({ where }),
      ]);

      return {
        credentials: credentials.map((credential) => ({
          ...credential,
          title: credential.name,
          service: credential.project?.name ?? "General empresa",
          clientName: credential.project?.client?.name ?? "Empresa",
          url: null,
          notes: null,
          password: MASKED_SECRET,
        })),
        projects,
        nextSkip: skip + credentials.length,
        hasMore: skip + credentials.length < total,
        total,
      };
    });

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to load vault" }, { status: 500 });
  }
}
