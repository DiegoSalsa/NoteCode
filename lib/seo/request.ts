import { NextRequest } from "next/server";

export function requestOrigin(request: NextRequest) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

export function oauthCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  };
}
