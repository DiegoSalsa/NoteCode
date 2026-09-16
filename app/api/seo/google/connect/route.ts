import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { isGoogleConfigured } from "@/lib/seo/config";
import { createOauthState, googleAuthUrl } from "@/lib/seo/google-oauth";
import { canManageSeoIntegrations } from "@/lib/seo/permissions";
import { oauthCookieOptions, requestOrigin } from "@/lib/seo/request";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageSeoIntegrations(user)) {
    return NextResponse.json({ error: "Solo un administrador puede conectar Google." }, { status: 403 });
  }
  if (!isGoogleConfigured()) {
    return NextResponse.json({ error: "Integración no configurada", configured: false }, { status: 503 });
  }

  const limit = rateLimit(clientKey(request, "seo-google-connect"), 10, 10 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Demasiados intentos. Espera un momento." }, { status: 429 });

  const state = createOauthState(user.id);
  const url = googleAuthUrl(requestOrigin(request), state);
  const response = NextResponse.redirect(url);
  response.cookies.set("notecode_seo_oauth", state, oauthCookieOptions());
  return response;
}
