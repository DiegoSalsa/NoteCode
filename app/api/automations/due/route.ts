import { NextResponse } from "next/server";
import { ensureDefaultRoutines, runDueAssistantRoutines } from "@/lib/assistant/routines";
import { getCurrentUser } from "@/lib/auth";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  await ensureDefaultRoutines(user.id);
  const result = await runDueAssistantRoutines();
  return NextResponse.json({ success: true, ...result });
}
