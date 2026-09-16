import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findAccessibleProject } from "@/lib/personal-workspace";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { canManageSeo } from "@/lib/seo/permissions";
import { syncSeoProject } from "@/lib/seo/sync";

type Params = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageSeo(user)) return NextResponse.json({ error: "Sin permisos para sincronizar SEO." }, { status: 403 });

  const limit = rateLimit(clientKey(request, `seo-sync:${user.id}`), 8, 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Espera un momento antes de volver a sincronizar." }, { status: 429 });

  const { projectId } = await params;
  const project = await findAccessibleProject(projectId, user.id);
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const seoProject = await prisma.seoProject.findUnique({ where: { projectId } });
  if (!seoProject) return NextResponse.json({ error: "Este proyecto todavía no tiene SEO habilitado." }, { status: 409 });

  const body = await request.json().catch(() => ({})) as { full?: boolean; sources?: Array<"gsc" | "ga4"> };
  const result = await syncSeoProject(seoProject.id, "manual", {
    force: true,
    full: Boolean(body.full),
    sources: body.sources,
  });
  if (!result.ok) return NextResponse.json({ error: result.error || "La sincronización falló.", ...result }, { status: 502 });
  return NextResponse.json({ success: true, ...result });
}
