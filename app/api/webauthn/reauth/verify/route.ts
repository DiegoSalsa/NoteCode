import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";
import {
  createRecentWebAuthnToken,
  getCurrentUser,
  RECENT_WEBAUTHN_COOKIE,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getWebAuthnConfig,
  parseWebAuthnChallenge,
  WEBAUTHN_CHALLENGE_COOKIE,
  webAuthnChallengeCookieOptions,
} from "@/lib/webauthn";

function toAuthenticatorTransports(transports: string[]) {
  return transports as AuthenticatorTransportFuture[];
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const challenge = parseWebAuthnChallenge(request.cookies.get(WEBAUTHN_CHALLENGE_COOKIE)?.value);
  if (!challenge || challenge.type !== "authentication" || challenge.userId !== user.id) {
    return NextResponse.json({ error: "La verificacion expiro. Intenta otra vez." }, { status: 400 });
  }

  const responseJson = await request.json();
  const passkey = await prisma.passkey.findFirst({
    where: {
      credentialId: responseJson.id,
      userId: user.id,
    },
  });

  if (!passkey) {
    return NextResponse.json({ error: "Esta huella no pertenece a tu usuario." }, { status: 404 });
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

  const response = NextResponse.json({ ok: true });
  response.cookies.set(RECENT_WEBAUTHN_COOKIE, createRecentWebAuthnToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 5,
  });
  response.cookies.set(WEBAUTHN_CHALLENGE_COOKIE, "", {
    ...webAuthnChallengeCookieOptions(),
    maxAge: 0,
  });

  return response;
}
