import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cached } from "@/lib/server-cache";

const MASKED_SECRET = "************";

export async function GET() {
  try {
    const data = await cached("vault", 30_000, async () => {
      const [credentials, projects] = await Promise.all([
        prisma.credential.findMany({
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
        }),
        prisma.project.findMany({
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            name: true,
            client: { select: { name: true } },
          },
        }),
      ]);

      return {
        credentials: credentials.map((credential) => ({
          ...credential,
          title: credential.name,
          service: credential.project.name,
          clientName: credential.project.client.name,
          url: null,
          notes: null,
          password: MASKED_SECRET,
        })),
        projects,
      };
    });

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to load vault" }, { status: 500 });
  }
}
