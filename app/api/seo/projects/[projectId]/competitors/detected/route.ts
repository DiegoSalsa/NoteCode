import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectCompetitorCandidates } from "@/lib/seo/competitors";
import { canViewSeo } from "@/lib/seo/permissions";
import { loadCompanySeoProject } from "@/lib/seo/project-access";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { projectId } = await params;
  const loaded = await loadCompanySeoProject(projectId, user.id);
  if (!loaded?.seoProject) return NextResponse.json({ error: "SEO no habilitado en este proyecto." }, { status: 404 });

  const [snapshots, existing] = await Promise.all([
    prisma.seoSerpSnapshot.findMany({
      where: { seoProjectId: loaded.seoProject.id },
      orderBy: { date: "desc" },
      distinct: ["seoKeywordId"],
      include: { results: { where: { type: "organic" }, select: { domain: true } } },
    }),
    prisma.seoCompetitor.findMany({
      where: { seoProjectId: loaded.seoProject.id },
      select: { domain: true },
    }),
  ]);
  const known = new Set(existing.map((item) => item.domain));
  const candidates = detectCompetitorCandidates(
    snapshots.map((snapshot) => ({ keywordId: snapshot.seoKeywordId, domains: snapshot.results.map((row) => row.domain) })),
    loaded.seoProject.primaryDomain,
  ).filter((item) => !known.has(item.domain));

  return NextResponse.json({ candidates });
}
