import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  serializeWebAuthnChallenge,
  WEBAUTHN_CHALLENGE_COOKIE,
  webAuthnChallengeCookieOptions,
  getWebAuthnConfig,
} from "@/lib/webauthn";

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

function toAuthenticatorTransports(transports: string[]) {
  return transports as AuthenticatorTransportFuture[];
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = normalizeEmail(body.email ?? "");
  const { rpID } = getWebAuthnConfig(request);
  const user = email ? await findUserByEmail(email) : null;
  const passkeys = user
    ? await prisma.passkey.findMany({
        where: { userId: user.id },
        select: { credentialId: true, transports: true },
      })
    : [];

  if (email && passkeys.length === 0) {
    return NextResponse.json(
      { error: "Este usuario todavia no tiene huella activada en este navegador." },
      { status: 404 },
    );
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: passkeys.length
      ? passkeys.map((passkey) => ({
          id: passkey.credentialId,
          transports: toAuthenticatorTransports(passkey.transports),
        }))
      : undefined,
    userVerification: "required",
  });

  const response = NextResponse.json(options);
  response.cookies.set(
    WEBAUTHN_CHALLENGE_COOKIE,
    serializeWebAuthnChallenge({
      type: "authentication",
      challenge: options.challenge,
      userId: user?.id,
      expiresAt: Date.now() + 1000 * 60 * 5,
    }),
    webAuthnChallengeCookieOptions(),
  );

  return response;
}
