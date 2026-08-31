import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findAccessibleProject } from "@/lib/personal-workspace";
import { jsonWithIdempotency } from "@/lib/idempotency-server";
import { invalidateCache } from "@/lib/server-cache";
import { recordAudit } from "@/lib/audit";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  const items = await prisma.projectDecision.findMany({ where: { projectId: id, deletedAt: null }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json(items);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await params;
  if (!await findAccessibleProject(id, user.id)) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  const body = await request.json();
  if (!body.title) return NextResponse.json({ error: "El título es obligatorio." }, { status: 400 });
  return jsonWithIdempotency(request, user.id, async () => {
    const item = await prisma.projectDecision.create({
      data: {
        projectId: id,
        title: body.title,
        context: body.context || "",
        decision: body.decision || "",
        alternatives: body.alternatives || "",
        consequences: body.consequences || "",
        status: body.status || "Propuesta",
        ownerName: body.ownerName || user.name,
        decidedAt: body.decidedAt ? new Date(body.decidedAt) : null,
      },
    });
    invalidateCache(`project:${id}`);
    await recordAudit({ action: "create", entityType: "decision", entityId: item.id, summary: `ADR: ${item.title}` });
    return { status: 201, body: item };
  });
}
