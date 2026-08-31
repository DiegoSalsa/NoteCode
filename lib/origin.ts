import { NextRequest, NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function assertSameOrigin(request: NextRequest) {
  if (SAFE_METHODS.has(request.method)) return null;
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const expected = new URL(request.url).origin;
  if (origin === expected) return null;
  return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
}
