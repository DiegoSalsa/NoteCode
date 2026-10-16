import { NextRequest, NextResponse } from "next/server";
import { canManage, canManageFinance, getCurrentUser } from "@/lib/auth";
import {
  projectCommercialSummary,
  issueMilestone,
  setBillingPlan,
} from "@/lib/commercial/billing";
import { commercialFailure } from "@/lib/commercial/http";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageFinance(user))
    return NextResponse.json(
      { error: "Sin permisos financieros." },
      { status: 403 },
    );
  try {
    return NextResponse.json(await projectCommercialSummary((await params).id));
  } catch (error) {
    return commercialFailure(error);
  }
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageFinance(user))
    return NextResponse.json(
      { error: "Sin permisos financieros." },
      { status: 403 },
    );
  try {
    const body = await request.json(),
      { id } = await params;
    const actor = {
      name: user.name,
      userId: user.id,
      origin: "INTERNAL" as const,
    };
    if (body.action === "issue")
      return NextResponse.json(
        await issueMilestone(id, String(body.milestoneId), actor),
      );
    if (body.action === "plan" && canManage(user))
      return NextResponse.json(
        await setBillingPlan(id, body.paymentPlan, actor),
      );
    return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
  } catch (error) {
    return commercialFailure(error);
  }
}
