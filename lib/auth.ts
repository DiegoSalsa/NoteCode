import { createHmac, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "purocode_session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

type AuthUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
};

export const AUTH_USERS: AuthUser[] = [
  {
    id: "diego",
    email: "diego.guzman@purocode.com",
    name: "Diego Guzman",
    passwordHash:
      "c613631a8a78ea7ca61eb4f322a19d20:087eccdef16d5f3e20ef3600941281548cf951dbbf8b23e3dd7dd5b05f68630fe5f33e66e0f7cd0a41c5cb87e82038be49ae15d95c5f9736d584d6f8d83345b8",
  },
  {
    id: "lucas",
    email: "lucas.mendez@purocode.com",
    name: "Lucas Mendez",
    passwordHash:
      "33210570b02797f1ecdd0131c80f696d:e261044b58bff1178ab3d975969de22f6cfe2a9e3fcac069a5f591d0148a0e58313bc79d4f8f35550bd2a6d3f4ba71892d07f1db30f326cbc51a95b306379bde",
  },
];

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

export function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;

  const passwordHash = scryptSync(password, salt, 64);
  const expectedHash = Buffer.from(hash, "hex");

  if (passwordHash.byteLength !== expectedHash.byteLength) return false;

  return timingSafeEqual(passwordHash, expectedHash);
}

export function findUserByEmail(email: string) {
  return AUTH_USERS.find((user) => user.email === email.toLowerCase().trim()) ?? null;
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

export function verifySessionToken(token: string | undefined) {
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

    return AUTH_USERS.find((user) => user.id === payload.userId) ?? null;
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
