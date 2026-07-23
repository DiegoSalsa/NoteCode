import { createHmac, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "notecode_session";
export const LAST_LOGIN_EMAIL_COOKIE = "notecode_last_email";
export const RECENT_WEBAUTHN_COOKIE = "notecode_recent_webauthn";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
const PASSWORD_KEY_LENGTH = 64;
const AUTH_PROFILE_CACHE_MS = 60_000;

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  age: number | null;
  passwordHash: string | null;
  role: string;
};

const globalForAuthCache = globalThis as unknown as {
  authProfileCache?: Map<string, { expiresAt: number; user: AuthUser | null }>;
};
const authProfileCache = globalForAuthCache.authProfileCache ?? new Map<string, { expiresAt: number; user: AuthUser | null }>();
globalForAuthCache.authProfileCache = authProfileCache;

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
      age: true,
      passwordHash: true,
      role: true,
      active: true,
    },
  });

  if (!profile || !profile.active) return null;

  return {
    id: profile.userId,
    email: profile.email,
    name: profile.displayName,
    age: profile.age,
    passwordHash: profile.passwordHash,
    role: profile.role,
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

export function createSessionCookie(userId: string) {
  return {
    name: SESSION_COOKIE_NAME,
    value: createSessionToken(userId),
    options: {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getSessionMaxAge(),
    },
  };
}

export function createRecentWebAuthnToken(userId: string) {
  const expiresAt = Date.now() + 1000 * 60 * 5;
  const encodedPayload = Buffer.from(JSON.stringify({ userId, expiresAt, nonce: randomUUID() }), "utf8").toString("base64url");

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyRecentWebAuthnToken(token: string | undefined, userId: string) {
  if (!token) return false;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;

  const expectedSignature = sign(encodedPayload);
  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (signatureBuffer.byteLength !== expectedBuffer.byteLength || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
      userId?: string;
      expiresAt?: number;
    };

    return payload.userId === userId && typeof payload.expiresAt === "number" && payload.expiresAt > Date.now();
  } catch {
    return false;
  }
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

    const cachedProfile = authProfileCache.get(payload.userId);
    if (cachedProfile && cachedProfile.expiresAt > Date.now()) return cachedProfile.user;

    const profile = await prisma.userProfile.findUnique({
      where: { userId: payload.userId },
      select: {
        userId: true,
        email: true,
        displayName: true,
        age: true,
        passwordHash: true,
        role: true,
        active: true,
      },
    });

    if (!profile || !profile.active) {
      authProfileCache.set(payload.userId, { expiresAt: Date.now() + AUTH_PROFILE_CACHE_MS, user: null });
      return null;
    }

    const user = {
      id: profile.userId,
      email: profile.email,
      name: profile.displayName,
      age: profile.age,
      passwordHash: profile.passwordHash,
      role: profile.role,
    };
    authProfileCache.set(payload.userId, { expiresAt: Date.now() + AUTH_PROFILE_CACHE_MS, user });
    return user;
  } catch {
    return null;
  }
}

export function getSessionMaxAge() {
  return SESSION_MAX_AGE_SECONDS;
}

const getCurrentUserForRequest = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  return verifySessionToken(token);
});

export async function getCurrentUser() {
  return getCurrentUserForRequest();
}

export async function hasRecentWebAuthn(userId: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(RECENT_WEBAUTHN_COOKIE)?.value;

  return verifyRecentWebAuthnToken(token, userId);
}

export function canManage(user: AuthUser) {
  return user.role === "ADMIN" || user.role === "MANAGER";
}

export function canManageFinance(user: AuthUser) {
  return canManage(user) || user.role === "FINANCE";
}
