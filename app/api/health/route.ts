import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      db: "up",
      latencyMs: Date.now() - started,
    });
  } catch {
    return NextResponse.json({ ok: false, db: "down", latencyMs: Date.now() - started }, { status: 503 });
  }
}
