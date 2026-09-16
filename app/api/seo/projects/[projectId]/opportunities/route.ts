import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewSeo } from "@/lib/seo/permissions";
import { loadCompanySeoProject } from "@/lib/seo/project-access";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const user = await getCurrentUser();
    if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { projectId } = await params;
    const loaded = await loadCompanySeoProject(projectId, user.id);
    if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado." }, { status: 404 });
    const type = request.nextUrl.searchParams.get("type") || "";
    const status = request.nextUrl.searchParams.get("status") || "OPEN";
    const confidence = request.nextUrl.searchParams.get("confidence") || "";
    const rows = await prisma.seoOpportunity.findMany({
      where: {
        seoProjectId: loaded.seoProject.id,
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
        ...(confidence ? { confidence } : {}),
      },
      orderBy: [{ score: "desc" }, { lastDetectedAt: "desc" }],
      take: 200,
    });
    return NextResponse.json({ rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron cargar oportunidades." }, { status: 500 });
  }
}
