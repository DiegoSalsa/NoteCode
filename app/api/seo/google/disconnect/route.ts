import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/log";
import { decryptSeoToken, encryptSeoToken } from "@/lib/seo/crypto";
import { getActiveGoogleConnection } from "@/lib/seo/google-client";
import { revokeGoogleToken } from "@/lib/seo/google-oauth";
import { canManageSeoIntegrations } from "@/lib/seo/permissions";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageSeoIntegrations(user)) {
    return NextResponse.json({ error: "Solo un administrador puede desconectar Google." }, { status: 403 });
  }

  const connection = await getActiveGoogleConnection();
  if (!connection) return NextResponse.json({ success: true, disconnected: false });

  const tokens = [connection.accessTokenEncrypted, connection.refreshTokenEncrypted].filter(Boolean) as string[];
  for (const encrypted of tokens) {
    try {
      await revokeGoogleToken(decryptSeoToken(encrypted));
    } catch {
      // Revocation is best-effort; we still disconnect locally.
    }
  }

  await prisma.seoGoogleConnection.update({
    where: { id: connection.id },
    data: {
      status: "disconnected",
      disconnectedAt: new Date(),
      lastError: null,
      accessTokenEncrypted: encryptSeoToken("revoked"),
      refreshTokenEncrypted: null,
    },
  });

  await recordAudit({
    action: "DISCONNECT",
    entityType: "SeoGoogleConnection",
    entityId: connection.id,
    summary: `Google desconectado: ${connection.googleAccountEmail}`,
  });
  logEvent("info", "seo.oauth.disconnected", { connectionId: connection.id });
  return NextResponse.json({ success: true, disconnected: true });
}
