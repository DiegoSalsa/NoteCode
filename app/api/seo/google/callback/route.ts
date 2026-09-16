import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/log";
import { encryptSeoToken } from "@/lib/seo/crypto";
import { SEO_GOOGLE_SCOPES } from "@/lib/seo/config";
import { discoverGoogleProperties } from "@/lib/seo/discover";
import {
  exchangeAuthorizationCode,
  fetchGoogleAccount,
  verifyOauthState,
} from "@/lib/seo/google-oauth";
import { canManageSeoIntegrations } from "@/lib/seo/permissions";
import { requestOrigin } from "@/lib/seo/request";

function redirectToIntegrations(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/seo/integraciones", requestOrigin(request));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = NextResponse.redirect(url);
  response.cookies.delete("notecode_seo_oauth");
  return response;
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/", request.url));
  if (!canManageSeoIntegrations(user)) {
    return redirectToIntegrations(request, { error: "Sin permisos para completar OAuth." });
  }

  const { searchParams } = new URL(request.url);
  const error = searchParams.get("error");
  if (error) {
    return redirectToIntegrations(request, { error: searchParams.get("error_description") || error });
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const cookieState = request.cookies.get("notecode_seo_oauth")?.value;
  const parsed = verifyOauthState(state);
  const parsedCookie = verifyOauthState(cookieState);

  if (!code || !parsed || !parsedCookie || parsed.nonce !== parsedCookie.nonce || parsed.userId !== user.id) {
    logEvent("warn", "seo.oauth.state_mismatch", { userId: user.id });
    return redirectToIntegrations(request, { error: "El estado OAuth no es válido. Intenta conectar de nuevo." });
  }

  try {
    const tokens = await exchangeAuthorizationCode(requestOrigin(request), code);
    const account = await fetchGoogleAccount(tokens.access_token!);
    const expiresAt = new Date(Date.now() + Math.max(60, tokens.expires_in ?? 3600) * 1000);
    const scopes = (tokens.scope || SEO_GOOGLE_SCOPES.join(" ")).split(/\s+/).filter(Boolean);

    const existing = await prisma.seoGoogleConnection.findFirst({
      where: { disconnectedAt: null },
      orderBy: { createdAt: "desc" },
    });

    const data = {
      googleAccountEmail: account.email!,
      googleAccountId: account.id ?? null,
      scopes,
      accessTokenEncrypted: encryptSeoToken(tokens.access_token!),
      refreshTokenEncrypted: tokens.refresh_token
        ? encryptSeoToken(tokens.refresh_token)
        : existing?.refreshTokenEncrypted ?? null,
      tokenExpiresAt: expiresAt,
      tokenType: tokens.token_type || "Bearer",
      status: "connected",
      lastError: null,
      connectedByUserId: user.id,
      disconnectedAt: null,
    };

    const connection = existing
      ? await prisma.seoGoogleConnection.update({ where: { id: existing.id }, data })
      : await prisma.seoGoogleConnection.create({ data });

    await discoverGoogleProperties(connection).catch((discoverError) => {
      logEvent("error", "seo.oauth.discover_failed", {
        connectionId: connection.id,
        message: discoverError instanceof Error ? discoverError.message : "discover failed",
      });
    });

    await recordAudit({
      action: "CONNECT",
      entityType: "SeoGoogleConnection",
      entityId: connection.id,
      summary: `Google conectado: ${account.email}`,
    });

    logEvent("info", "seo.oauth.connected", { connectionId: connection.id, email: account.email });
    return redirectToIntegrations(request, { connected: "1" });
  } catch (callbackError) {
    logEvent("error", "seo.oauth.callback_failed", {
      message: callbackError instanceof Error ? callbackError.message : "callback failed",
    });
    return redirectToIntegrations(request, {
      error: callbackError instanceof Error ? callbackError.message : "No se pudo completar la conexión con Google.",
    });
  }
}
