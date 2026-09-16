import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { analyzeProjectOpportunities } from "@/lib/seo/analyze-opportunities";
import { canManageSeo } from "@/lib/seo/permissions";
import { loadCompanySeoProject } from "@/lib/seo/project-access";

type Params = { params: Promise<{ projectId: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!canManageSeo(user)) return NextResponse.json({ error: "Sin permisos." }, { status: 403 });
    const { projectId } = await params;
    const loaded = await loadCompanySeoProject(projectId, user.id);
    if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado." }, { status: 404 });
    const result = await analyzeProjectOpportunities(loaded.seoProject.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "El análisis falló." }, { status: 500 });
  }
}
