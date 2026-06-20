import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getWebAuthnConfig,
  serializeWebAuthnChallenge,
  WEBAUTHN_CHALLENGE_COOKIE,
  webAuthnChallengeCookieOptions,
} from "@/lib/webauthn";

function toAuthenticatorTransports(transports: string[]) {
  return transports as AuthenticatorTransportFuture[];
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const passkeys = await prisma.passkey.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  });

  if (passkeys.length === 0) {
    return NextResponse.json({ error: "Activa la huella en Perfil antes de revelar secretos." }, { status: 400 });
  }

  const { rpID } = getWebAuthnConfig(request);
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: toAuthenticatorTransports(passkey.transports),
    })),
    userVerification: "required",
  });

  const response = NextResponse.json(options);
  response.cookies.set(
    WEBAUTHN_CHALLENGE_COOKIE,
    serializeWebAuthnChallenge({
      type: "authentication",
      challenge: options.challenge,
      userId: user.id,
      expiresAt: Date.now() + 1000 * 60 * 5,
    }),
    webAuthnChallengeCookieOptions(),
  );

  return response;
}
