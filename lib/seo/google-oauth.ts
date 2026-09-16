import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { SEO_GOOGLE_SCOPES, googleClientId, googleClientSecret, googleRedirectUri } from "@/lib/seo/config";

type OauthState = {
  userId: string;
  nonce: string;
  expiresAt: number;
};

function stateSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for Google OAuth state.");
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", stateSecret()).update(value).digest("hex");
}

export function createOauthState(userId: string) {
  const payload: OauthState = {
    userId,
    nonce: randomUUID(),
    expiresAt: Date.now() + 10 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyOauthState(token: string | undefined | null): OauthState | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const left = Buffer.from(signature, "hex");
  const right = Buffer.from(expected, "hex");
  if (left.byteLength !== right.byteLength || !timingSafeEqual(left, right)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as OauthState;
    if (!payload.userId || !payload.nonce || payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function googleAuthUrl(origin: string, state: string) {
  const params = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: googleRedirectUri(origin),
    response_type: "code",
    scope: SEO_GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeAuthorizationCode(origin: string, code: string) {
  const body = new URLSearchParams({
    code,
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    redirect_uri: googleRedirectUri(origin),
    grant_type: "authorization_code",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({})) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "No se pudo intercambiar el código OAuth.");
  }
  return payload;
}

export async function refreshGoogleAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => ({})) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "No se pudo renovar el token de Google.");
  }
  return payload;
}

export async function revokeGoogleToken(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  }).catch(() => null);
}

export async function fetchGoogleAccount(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json().catch(() => ({})) as {
    id?: string;
    email?: string;
    name?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.email) {
    throw new Error(payload.error?.message || "No se pudo leer la cuenta de Google.");
  }
  return payload;
}
