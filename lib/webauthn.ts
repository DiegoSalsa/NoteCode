import type { NextRequest } from "next/server";

export const WEBAUTHN_CHALLENGE_COOKIE = "notecode_webauthn_challenge";

export type WebAuthnChallenge = {
  type: "registration" | "authentication";
  challenge: string;
  userId?: string;
  expiresAt: number;
};

export function getWebAuthnConfig(request: NextRequest) {
  const configuredUrl = process.env.APP_URL ? new URL(process.env.APP_URL) : null;
  const host = configuredUrl?.host ?? request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = configuredUrl?.protocol.replace(":", "") ?? request.headers.get("x-forwarded-proto") ?? "http";

  if (!host) {
    throw new Error("No se pudo determinar el dominio para WebAuthn.");
  }

  const hostname = host.split(":")[0];

  return {
    rpName: "NoteCode",
    rpID: hostname,
    origin: `${proto}://${host}`,
  };
}

export function serializeWebAuthnChallenge(challenge: WebAuthnChallenge) {
  return Buffer.from(JSON.stringify(challenge), "utf8").toString("base64url");
}

export function parseWebAuthnChallenge(value: string | undefined): WebAuthnChallenge | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as WebAuthnChallenge;

    if (!parsed.challenge || !parsed.type || parsed.expiresAt < Date.now()) return null;

    return parsed;
  } catch {
    return null;
  }
}

export function webAuthnChallengeCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 5,
  };
}
