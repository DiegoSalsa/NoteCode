import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageSeo } from "@/lib/seo/permissions";

type Params = { params: Promise<{ alertId: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageSeo(user)) return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
  const { alertId } = await params;
  const body = await request.json().catch(() => ({})) as { status?: string };
  if (!["open", "acknowledged", "resolved", "ignored"].includes(body.status || "")) {
    return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  }
  const alert = await prisma.seoAlert.update({ where: { id: alertId }, data: { status: body.status } });
  return NextResponse.json({ success: true, alert });
}
