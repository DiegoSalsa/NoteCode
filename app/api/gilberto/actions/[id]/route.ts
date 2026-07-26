import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/server-cache";

const decisionSchema = z.object({ decision: z.enum(["approve", "reject"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Decisión inválida." }, { status: 400 });

  const { id } = await params;
  const action = await prisma.assistantAction.findFirst({ where: { id, userId: user.id } });
  if (!action) return NextResponse.json({ error: "Acción no encontrada." }, { status: 404 });
  if (action.status !== "pending") {
    return NextResponse.json({ error: `La acción ya está ${action.status}.` }, { status: 409 });
  }

  const approved = parsed.data.decision === "approve";
  const updated = await prisma.assistantAction.update({
    where: { id: action.id },
    data: {
      status: approved ? "approved" : "rejected",
      approvedAt: approved ? new Date() : null,
    },
  });
  await recordAudit({
    action: approved ? "APPROVE" : "REJECT",
    entityType: "AssistantAction",
    entityId: updated.id,
    summary: `${approved ? "Aprobada" : "Rechazada"}: ${updated.title}`,
    metadata: { type: updated.type, riskLevel: updated.riskLevel },
  });
  invalidateCache(`gilberto:today:${user.id}`);

  return NextResponse.json(updated);
}
