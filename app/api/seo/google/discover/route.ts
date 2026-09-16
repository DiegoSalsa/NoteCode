import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { isGoogleConfigured } from "@/lib/seo/config";
import { getActiveGoogleConnection } from "@/lib/seo/google-client";
import { canManageSeoIntegrations } from "@/lib/seo/permissions";
import { syncDiscovery } from "@/lib/seo/sync";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageSeoIntegrations(user)) {
    return NextResponse.json({ error: "Solo un administrador puede descubrir propiedades." }, { status: 403 });
  }
  if (!isGoogleConfigured()) {
    return NextResponse.json({ error: "Integración no configurada", configured: false }, { status: 503 });
  }
  const connection = await getActiveGoogleConnection();
  if (!connection) return NextResponse.json({ error: "No hay una cuenta de Google conectada." }, { status: 409 });

  const result = await syncDiscovery("manual", true);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  await recordAudit({
    action: "DISCOVER",
    entityType: "SeoGoogleConnection",
    entityId: connection.id,
    summary: "Propiedades Google redescubiertas",
  });
  return NextResponse.json({ success: true, ...result });
}
