import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PROJECT_TEMPLATES } from "@/lib/templates";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json(PROJECT_TEMPLATES.map(({ key, name, description }) => ({ key, name, description })));
}
