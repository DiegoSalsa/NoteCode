import type { SeoGoogleConnection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/log";
import { decryptSeoToken, encryptSeoToken } from "@/lib/seo/crypto";
import { refreshGoogleAccessToken } from "@/lib/seo/google-oauth";
import { SeoHttpError, fetchJsonWithRetry } from "@/lib/seo/http";

const refreshLocks = new Map<string, Promise<string>>();

function publicError(message: string) {
  return message.replace(/ya29\.[A-Za-z0-9._-]+/g, "[REDACTED]").replace(/1\/\/[A-Za-z0-9._-]+/g, "[REDACTED]");
}

export { toPublicConnection } from "@/lib/seo/public";

export async function getActiveGoogleConnection() {
  return prisma.seoGoogleConnection.findFirst({
    where: { disconnectedAt: null, status: { not: "disconnected" } },
    orderBy: { createdAt: "desc" },
  });
}

async function persistRefreshedToken(connection: SeoGoogleConnection, accessToken: string, expiresIn?: number) {
  const tokenExpiresAt = new Date(Date.now() + Math.max(60, expiresIn ?? 3600) * 1000);
  await prisma.seoGoogleConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEncrypted: encryptSeoToken(accessToken),
      tokenExpiresAt,
      status: "connected",
      lastError: null,
    },
  });
  return accessToken;
}

export async function getValidAccessToken(connection: SeoGoogleConnection) {
  const stillValid = connection.tokenExpiresAt.getTime() - Date.now() > 60_000;
  if (stillValid) return decryptSeoToken(connection.accessTokenEncrypted);

  const existing = refreshLocks.get(connection.id);
  if (existing) return existing;

  const refresh = (async () => {
    if (!connection.refreshTokenEncrypted) {
      await prisma.seoGoogleConnection.update({
        where: { id: connection.id },
        data: { status: "expired", lastError: "No hay refresh token. Vuelve a conectar Google." },
      });
      throw new Error("La conexión de Google expiró. Vuelve a autorizar la cuenta.");
    }
    try {
      const refreshToken = decryptSeoToken(connection.refreshTokenEncrypted);
      const payload = await refreshGoogleAccessToken(refreshToken);
      return persistRefreshedToken(connection, payload.access_token!, payload.expires_in);
    } catch (error) {
      const message = publicError(error instanceof Error ? error.message : "Token revocado o inválido.");
      const revoked = /invalid_grant|revoked|unauthorized/i.test(message);
      await prisma.seoGoogleConnection.update({
        where: { id: connection.id },
        data: { status: revoked ? "revoked" : "error", lastError: message },
      });
      logEvent("error", "seo.google.refresh_failed", { connectionId: connection.id, status: revoked ? "revoked" : "error" });
      throw new Error(revoked ? "Google revocó el acceso. Vuelve a conectar la cuenta." : message, { cause: error });
    } finally {
      refreshLocks.delete(connection.id);
    }
  })();

  refreshLocks.set(connection.id, refresh);
  return refresh;
}

export async function googleApiJson<T>(
  connection: SeoGoogleConnection,
  url: string,
  init: RequestInit = {},
  options?: { timeoutMs?: number; seoProjectId?: string | null; provider?: string; endpoint?: string },
) {
  const accessToken = await getValidAccessToken(connection);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  try {
    const result = await fetchJsonWithRetry<T>(url, { ...init, headers }, { timeoutMs: options?.timeoutMs ?? 25_000, retries: 2 });
    await prisma.seoApiUsage.create({
      data: {
        provider: options?.provider ?? "google",
        endpoint: options?.endpoint ?? url.split("?")[0] ?? url,
        requests: 1,
        seoProjectId: options?.seoProjectId ?? null,
      },
    }).catch(() => null);
    return result.data;
  } catch (error) {
    if (error instanceof SeoHttpError && error.status === 401) {
      refreshLocks.delete(connection.id);
      const latest = await prisma.seoGoogleConnection.findUnique({ where: { id: connection.id } });
      if (!latest?.refreshTokenEncrypted) throw error;
      const forced = { ...latest, tokenExpiresAt: new Date(0) };
      const retryToken = await getValidAccessToken(forced);
      headers.set("Authorization", `Bearer ${retryToken}`);
      const retried = await fetchJsonWithRetry<T>(url, { ...init, headers }, { timeoutMs: options?.timeoutMs ?? 25_000, retries: 1 });
      return retried.data;
    }
    throw error;
  }
}
