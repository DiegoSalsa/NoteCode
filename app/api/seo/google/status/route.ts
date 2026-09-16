import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isGoogleConfigured } from "@/lib/seo/config";
import { getActiveGoogleConnection, toPublicConnection } from "@/lib/seo/google-client";
import { canManageSeo, canManageSeoIntegrations, canViewSeo } from "@/lib/seo/permissions";

export async function GET() {
  const user = await getCurrentUser();
  if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const connection = await getActiveGoogleConnection();
  return NextResponse.json({
    configured: isGoogleConfigured(),
    connection: toPublicConnection(connection),
    permissions: {
      view: true,
      manage: canManageSeo(user),
      integrations: canManageSeoIntegrations(user),
    },
  });
}
