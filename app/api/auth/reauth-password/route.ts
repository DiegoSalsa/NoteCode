import { NextResponse } from "next/server";
import {
  createRecentWebAuthnToken,
  getCurrentUser,
  RECENT_WEBAUTHN_COOKIE,
  verifyPassword,
} from "@/lib/auth";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { password?: string };

  if (!verifyPassword(body.password ?? "", user.passwordHash)) {
    return NextResponse.json({ error: "Clave incorrecta." }, { status: 401 });
  }

  const token = createRecentWebAuthnToken(user.id);
  const response = NextResponse.json({ ok: true, token });
  response.cookies.set(RECENT_WEBAUTHN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 5,
  });

  return response;
}
