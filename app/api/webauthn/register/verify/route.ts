import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  parseWebAuthnChallenge,
  WEBAUTHN_CHALLENGE_COOKIE,
  webAuthnChallengeCookieOptions,
  getWebAuthnConfig,
} from "@/lib/webauthn";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const challenge = parseWebAuthnChallenge(request.cookies.get(WEBAUTHN_CHALLENGE_COOKIE)?.value);

  if (!challenge || challenge.type !== "registration" || challenge.userId !== user.id) {
    return NextResponse.json({ error: "El desafio biometrico expiro. Intenta otra vez." }, { status: 400 });
  }

  const responseJson = await request.json();
  const { origin, rpID } = getWebAuthnConfig(request);
  const verification = await verifyRegistrationResponse({
    response: responseJson,
    expectedChallenge: challenge.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  });

  if (!verification.verified) {
    return NextResponse.json({ error: "No se pudo verificar la huella." }, { status: 400 });
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  await prisma.passkey.upsert({
    where: { credentialId: credential.id },
    create: {
      userId: user.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
    },
    update: {
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
    },
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(WEBAUTHN_CHALLENGE_COOKIE, "", {
    ...webAuthnChallengeCookieOptions(),
    maxAge: 0,
  });

  return response;
}
