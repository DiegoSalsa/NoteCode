import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { EXPORT_FORMAT_VERSION } from "@/lib/export";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const body = await request.json().catch(() => null) as { preview?: boolean; manifest?: { format?: string }; projects?: unknown[]; notes?: unknown[]; tasks?: unknown[]; requirements?: unknown[]; credentials?: unknown[] } | null;
  if (!body) return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  const errors: string[] = [];
  if (body.manifest?.format && body.manifest.format !== EXPORT_FORMAT_VERSION) {
    errors.push(`Formato ${body.manifest.format} no coincide con ${EXPORT_FORMAT_VERSION}.`);
  }
  const counts = {
    projects: Array.isArray(body.projects) ? body.projects.length : 0,
    notes: Array.isArray(body.notes) ? body.notes.length : 0,
    tasks: Array.isArray(body.tasks) ? body.tasks.length : 0,
    requirements: Array.isArray(body.requirements) ? body.requirements.length : 0,
    credentials: Array.isArray(body.credentials) ? body.credentials.length : 0,
  };
  return NextResponse.json({
    preview: true,
    applied: false,
    counts,
    duplicates: [],
    errors,
    message: "Vista previa lista. La importación destructiva queda deshabilitada hasta que el propietario confirme el mapeo.",
  });
}
