import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";
import { createSessionCookie, LAST_LOGIN_EMAIL_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  parseWebAuthnChallenge,
  WEBAUTHN_CHALLENGE_COOKIE,
  webAuthnChallengeCookieOptions,
  getWebAuthnConfig,
} from "@/lib/webauthn";

function toAuthenticatorTransports(transports: string[]) {
  return transports as AuthenticatorTransportFuture[];
}

export async function POST(request: NextRequest) {
  const challenge = parseWebAuthnChallenge(request.cookies.get(WEBAUTHN_CHALLENGE_COOKIE)?.value);

  if (!challenge || challenge.type !== "authentication") {
    return NextResponse.json({ error: "El desafio biometrico expiro. Intenta otra vez." }, { status: 400 });
  }

  const responseJson = await request.json();
  const passkey = await prisma.passkey.findUnique({
    where: { credentialId: responseJson.id },
    include: {
      user: {
        select: {
          userId: true,
          email: true,
        },
      },
    },
  });

  if (!passkey || (challenge.userId && challenge.userId !== passkey.userId)) {
    return NextResponse.json({ error: "No encontramos una huella registrada para este acceso." }, { status: 404 });
  }

  const { origin, rpID } = getWebAuthnConfig(request);
  const verification = await verifyAuthenticationResponse({
    response: responseJson,
    expectedChallenge: challenge.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(passkey.publicKey),
      counter: passkey.counter,
      transports: toAuthenticatorTransports(passkey.transports),
    },
    requireUserVerification: true,
  });

  if (!verification.verified) {
    return NextResponse.json({ error: "No se pudo verificar la huella." }, { status: 400 });
  }

  await prisma.passkey.update({
    where: { id: passkey.id },
    data: {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    },
  });

  const sessionCookie = createSessionCookie(passkey.user.userId);
  const response = NextResponse.json({ ok: true });

  response.cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.options);
  response.cookies.set(LAST_LOGIN_EMAIL_COOKIE, passkey.user.email, {
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  response.cookies.set(WEBAUTHN_CHALLENGE_COOKIE, "", {
    ...webAuthnChallengeCookieOptions(),
    maxAge: 0,
  });

  return response;
}
