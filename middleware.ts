import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/", "/establecer-clave"];
const SESSION_COOKIE_NAME = "purocode_session";

let cachedSecret: string | undefined;
let cachedKeyPromise: Promise<CryptoKey> | null = null;

function base64UrlToText(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

  return atob(padded);
}

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(value: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;

  if (!cachedKeyPromise || cachedSecret !== secret) {
    cachedSecret = secret;
    cachedKeyPromise = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }

  const key = await cachedKeyPromise;
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));

  return bytesToHex(signature);
}

async function hasValidSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;

  const expectedSignature = await sign(encodedPayload);
  if (!expectedSignature || expectedSignature !== signature) return false;

  try {
    const payload = JSON.parse(base64UrlToText(encodedPayload)) as { expiresAt?: number };
    return typeof payload.expiresAt === "number" && payload.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = await hasValidSession(request);
  const isPublicPath = PUBLIC_PATHS.includes(pathname);
  const isApiPath = pathname.startsWith("/api");

  if (isPublicPath && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!isPublicPath && !hasSession) {
    if (isApiPath) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
