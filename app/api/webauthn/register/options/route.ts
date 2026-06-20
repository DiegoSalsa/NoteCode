import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  serializeWebAuthnChallenge,
  WEBAUTHN_CHALLENGE_COOKIE,
  webAuthnChallengeCookieOptions,
  getWebAuthnConfig,
} from "@/lib/webauthn";

function toAuthenticatorTransports(transports: string[]) {
  return transports as AuthenticatorTransportFuture[];
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rpName, rpID } = getWebAuthnConfig(request);
  const passkeys = await prisma.passkey.findMany({
    where: { userId: user.id },
    select: { credentialId: true, transports: true },
  });

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    userDisplayName: user.name,
    attestationType: "none",
    excludeCredentials: passkeys.map((passkey) => ({
      id: passkey.credentialId,
      transports: toAuthenticatorTransports(passkey.transports),
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
    preferredAuthenticatorType: "localDevice",
  });

  const response = NextResponse.json(options);
  response.cookies.set(
    WEBAUTHN_CHALLENGE_COOKIE,
    serializeWebAuthnChallenge({
      type: "registration",
      challenge: options.challenge,
      userId: user.id,
      expiresAt: Date.now() + 1000 * 60 * 5,
    }),
    webAuthnChallengeCookieOptions(),
  );

  return response;
}
