import { NextRequest, NextResponse } from "next/server";
import { canManageFinance, getCurrentUser } from "@/lib/auth";
import { archiveInvoice, updateInvoice } from "@/lib/commercial/billing";
import { commercialFailure } from "@/lib/commercial/http";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageFinance(user)) return NextResponse.json({ error: "Sin permisos financieros." }, { status: 403 });
  try { return NextResponse.json(await updateInvoice((await params).id, await request.json(), { name: user.name, userId: user.id, origin: "INTERNAL" })); }
  catch (error) { return commercialFailure(error); }
}
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageFinance(user)) return NextResponse.json({ error: "Sin permisos financieros." }, { status: 403 });
  try { await archiveInvoice((await params).id, { name: user.name, userId: user.id, origin: "INTERNAL" }); return NextResponse.json({ success: true }); }
  catch (error) { return commercialFailure(error); }
}
