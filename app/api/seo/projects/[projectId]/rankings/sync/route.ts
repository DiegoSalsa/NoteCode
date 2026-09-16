import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { seoRankingsCooldownMs } from "@/lib/seo/config";
import { canManageSeo } from "@/lib/seo/permissions";
import { loadCompanySeoProject } from "@/lib/seo/project-access";
import { syncProjectRankings } from "@/lib/seo/rankings";

type Params = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canManageSeo(user)) return NextResponse.json({ error: "Sin permisos para actualizar rankings." }, { status: 403 });

  const cooldown = seoRankingsCooldownMs();
  const limit = rateLimit(clientKey(request, `seo-rankings:${user.id}`), 1, cooldown);
  if (!limit.ok) {
    return NextResponse.json({
      error: `Espera ${Math.ceil(limit.retryAfterMs / 60000)} min antes de volver a consultar SERPs. Cada sync tiene costo.`,
      retryAfterMs: limit.retryAfterMs,
    }, { status: 429 });
  }

  const { projectId } = await params;
  const loaded = await loadCompanySeoProject(projectId, user.id);
  if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado en este proyecto." }, { status: 404 });

  const result = await syncProjectRankings(loaded.seoProject.id, "manual", { force: true });
  if (!result.ok) {
    const status = result.status === "budget_exceeded" ? 402 : 502;
    return NextResponse.json({ error: result.error, ...result }, { status });
  }
  return NextResponse.json({ success: true, ...result });
}
