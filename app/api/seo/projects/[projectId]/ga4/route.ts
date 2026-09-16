import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findAccessibleProject } from "@/lib/personal-workspace";
import { resolvePeriod } from "@/lib/seo/dates";
import { summarizeGa4 } from "@/lib/seo/aggregates";
import { canViewSeo } from "@/lib/seo/permissions";

type Params = { params: Promise<{ projectId: string }> };

function range(from: string, to: string) {
  return { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) };
}

export async function GET(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { projectId } = await params;
  const project = await findAccessibleProject(projectId, user.id);
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  const seoProject = await prisma.seoProject.findUnique({ where: { projectId } });
  if (!seoProject) return NextResponse.json({ error: "SEO no habilitado en este proyecto." }, { status: 404 });

  const { searchParams } = new URL(request.url);
  let period;
  try {
    period = resolvePeriod(searchParams.get("range"), searchParams.get("from"), searchParams.get("to"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Rango inválido" }, { status: 400 });
  }

  const view = searchParams.get("view") || "overview";
  const q = searchParams.get("q")?.trim() || "";
  const skip = Math.max(0, Number(searchParams.get("skip") || 0) || 0);
  const take = Math.min(100, Math.max(1, Number(searchParams.get("take") || 50) || 50));
  const current = range(period.from, period.to);

  if (view === "overview") {
    const [site, sources] = await Promise.all([
      prisma.seoGa4SiteDaily.findMany({ where: { seoProjectId: seoProject.id, date: current }, orderBy: { date: "asc" } }),
      prisma.seoGa4SourceDaily.findMany({ where: { seoProjectId: seoProject.id, date: current } }),
    ]);
    const sourceMap = new Map<string, { source: string; medium: string; users: number; sessions: number }>();
    for (const row of sources) {
      const key = `${row.source}|${row.medium}`;
      const currentRow = sourceMap.get(key) ?? { source: row.source, medium: row.medium, users: 0, sessions: 0 };
      currentRow.users += row.users;
      currentRow.sessions += row.sessions;
      sourceMap.set(key, currentRow);
    }
    return NextResponse.json({
      period,
      summary: summarizeGa4(site),
      series: site.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        users: row.users,
        sessions: row.sessions,
        engagedSessions: row.engagedSessions,
        engagementRate: row.engagementRate,
        organicSessions: row.organicSessions,
        keyEvents: row.keyEvents,
      })),
      sources: [...sourceMap.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 20),
    });
  }

  if (view === "landings") {
    const rows = await prisma.seoGa4LandingDaily.findMany({
      where: {
        seoProjectId: seoProject.id,
        date: current,
        ...(q ? { landingPage: { contains: q, mode: Prisma.QueryMode.insensitive } } : {}),
      },
    });
    const map = new Map<string, { landingPage: string; users: number; sessions: number; engagedSessions: number; keyEvents: number }>();
    for (const row of rows) {
      const currentRow = map.get(row.landingPage) ?? {
        landingPage: row.landingPage,
        users: 0,
        sessions: 0,
        engagedSessions: 0,
        keyEvents: 0,
      };
      currentRow.users += row.users;
      currentRow.sessions += row.sessions;
      currentRow.engagedSessions += row.engagedSessions;
      currentRow.keyEvents += row.keyEvents;
      map.set(row.landingPage, currentRow);
    }
    const aggregated = [...map.values()]
      .map((item) => ({
        ...item,
        engagementRate: item.sessions > 0 ? item.engagedSessions / item.sessions : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions);
    return NextResponse.json({
      period,
      total: aggregated.length,
      rows: aggregated.slice(skip, skip + take),
    });
  }

  return NextResponse.json({ error: "Vista no soportada." }, { status: 400 });
}
