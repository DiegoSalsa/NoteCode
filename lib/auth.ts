import { createHmac, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "purocode_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const PASSWORD_KEY_LENGTH = 64;

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET is required for authentication.");
  }

  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret()).update(value).digest("hex");
}

export function hashPassword(password: string) {
  const salt = randomUUID().replace(/-/g, "");
  const passwordHash = scryptSync(password, salt, PASSWORD_KEY_LENGTH).toString("hex");

  return `${salt}:${passwordHash}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;

  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const passwordHash = scryptSync(password, salt, PASSWORD_KEY_LENGTH);
  const expectedHash = Buffer.from(hash, "hex");

  if (passwordHash.byteLength !== expectedHash.byteLength) return false;

  return timingSafeEqual(passwordHash, expectedHash);
}

function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const profile = await prisma.userProfile.findUnique({
    where: { email: normalizeEmail(email) },
    select: {
      userId: true,
      email: true,
      displayName: true,
      passwordHash: true,
    },
  });

  if (!profile) return null;

  return {
    id: profile.userId,
    email: profile.email,
    name: profile.displayName,
    passwordHash: profile.passwordHash,
  };
}

export function createSessionToken(userId: string) {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = JSON.stringify({
    userId,
    expiresAt,
    nonce: randomUUID(),
  });
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  const signature = sign(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export async function verifySessionToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = sign(encodedPayload);
  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (
    signatureBuffer.byteLength !== expectedBuffer.byteLength ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
      userId: string;
      expiresAt: number;
    };

    if (!payload.userId || payload.expiresAt < Date.now()) return null;

    const profile = await prisma.userProfile.findUnique({
      where: { userId: payload.userId },
      select: {
        userId: true,
        email: true,
        displayName: true,
        passwordHash: true,
      },
    });

    if (!profile) return null;

    return {
      id: profile.userId,
      email: profile.email,
      name: profile.displayName,
      passwordHash: profile.passwordHash,
    };
  } catch {
    return null;
  }
}

export function getSessionMaxAge() {
  return SESSION_MAX_AGE_SECONDS;
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return verifySessionToken(token);
}
