import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findAccessibleProject } from "@/lib/personal-workspace";
import { resolvePeriod, weightedAverage } from "@/lib/seo/dates";
import { canViewSeo } from "@/lib/seo/permissions";

type Params = { params: Promise<{ projectId: string }> };

const SORTS = new Set(["clicks", "impressions", "ctr", "position", "query", "page", "device", "country"]);

function range(from: string, to: string) {
  return { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) };
}

function aggregate<T extends { clicks: number; impressions: number; ctr: number; position: number }>(
  rows: T[],
  keyOf: (row: T) => string,
) {
  const map = new Map<string, { key: string; clicks: number; impressions: number; positionWeight: number }>();
  for (const row of rows) {
    const key = keyOf(row);
    const current = map.get(key) ?? { key, clicks: 0, impressions: 0, positionWeight: 0 };
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    current.positionWeight += row.position * row.impressions;
    map.set(key, current);
  }
  return [...map.values()].map((item) => ({
    key: item.key,
    clicks: item.clicks,
    impressions: item.impressions,
    ctr: item.impressions > 0 ? item.clicks / item.impressions : 0,
    position: item.impressions > 0 ? item.positionWeight / item.impressions : 0,
  }));
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
  const sort = SORTS.has(searchParams.get("sort") || "") ? searchParams.get("sort")! : "clicks";
  const dir = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const skip = Math.max(0, Number(searchParams.get("skip") || 0) || 0);
  const take = Math.min(100, Math.max(1, Number(searchParams.get("take") || 50) || 50));
  const current = range(period.from, period.to);
  const previous = range(period.previousFrom, period.previousTo);

  if (view === "overview") {
    const [site, devices, countries] = await Promise.all([
      prisma.seoGscSiteDaily.findMany({ where: { seoProjectId: seoProject.id, date: current }, orderBy: { date: "asc" } }),
      prisma.seoGscDeviceDaily.findMany({ where: { seoProjectId: seoProject.id, date: current } }),
      prisma.seoGscCountryDaily.findMany({ where: { seoProjectId: seoProject.id, date: current } }),
    ]);
    const summary = {
      clicks: site.reduce((sum, row) => sum + row.clicks, 0),
      impressions: site.reduce((sum, row) => sum + row.impressions, 0),
      ctr: 0,
      position: weightedAverage(site.map((row) => ({ weight: row.impressions, value: row.position }))),
    };
    summary.ctr = summary.impressions > 0 ? summary.clicks / summary.impressions : 0;
    return NextResponse.json({
      period,
      summary,
      series: site.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      })),
      devices: aggregate(devices, (row) => row.device),
      countries: aggregate(countries, (row) => row.country).sort((a, b) => b.clicks - a.clicks).slice(0, 20),
    });
  }

  if (view === "queries" || view === "pages") {
    const isQuery = view === "queries";
    const whereCurrent = {
      seoProjectId: seoProject.id,
      date: current,
      ...(q ? (isQuery ? { query: { contains: q, mode: Prisma.QueryMode.insensitive } } : { page: { contains: q, mode: Prisma.QueryMode.insensitive } }) : {}),
    };
    const [currentRows, previousRows] = await Promise.all([
      isQuery
        ? prisma.seoGscQueryDaily.findMany({ where: whereCurrent })
        : prisma.seoGscPageDaily.findMany({ where: whereCurrent }),
      isQuery
        ? prisma.seoGscQueryDaily.findMany({ where: { seoProjectId: seoProject.id, date: previous } })
        : prisma.seoGscPageDaily.findMany({ where: { seoProjectId: seoProject.id, date: previous } }),
    ]);

    const currentAgg = aggregate(currentRows as Array<{ clicks: number; impressions: number; ctr: number; position: number; query?: string; page?: string }>, (row) =>
      isQuery ? (row as { query: string }).query : (row as { page: string }).page,
    );
    const previousAgg = new Map(
      aggregate(previousRows as Array<{ clicks: number; impressions: number; ctr: number; position: number; query?: string; page?: string }>, (row) =>
        isQuery ? (row as { query: string }).query : (row as { page: string }).page,
      ).map((item) => [item.key, item]),
    );

    const rows = currentAgg.map((item) => {
      const before = previousAgg.get(item.key);
      return {
        key: item.key,
        clicks: item.clicks,
        impressions: item.impressions,
        ctr: item.ctr,
        position: item.position,
        previousPosition: before?.position ?? null,
        deltaPosition: before ? item.position - before.position : null,
        previousClicks: before?.clicks ?? 0,
      };
    });

    rows.sort((a, b) => {
      const left = a[sort as keyof typeof a];
      const right = b[sort as keyof typeof b];
      if (typeof left === "string" && typeof right === "string") {
        return dir === "asc" ? left.localeCompare(right) : right.localeCompare(left);
      }
      return dir === "asc" ? Number(left ?? 0) - Number(right ?? 0) : Number(right ?? 0) - Number(left ?? 0);
    });

    return NextResponse.json({
      period,
      total: rows.length,
      skip,
      take,
      rows: rows.slice(skip, skip + take),
    });
  }

  if (view === "devices" || view === "countries") {
    const rows = view === "devices"
      ? await prisma.seoGscDeviceDaily.findMany({ where: { seoProjectId: seoProject.id, date: current } })
      : await prisma.seoGscCountryDaily.findMany({ where: { seoProjectId: seoProject.id, date: current } });
    const aggregated = aggregate(
      rows as Array<{ clicks: number; impressions: number; ctr: number; position: number; device?: string; country?: string }>,
      (row) => view === "devices" ? (row as { device: string }).device : (row as { country: string }).country,
    ).sort((a, b) => b.clicks - a.clicks);
    return NextResponse.json({ period, rows: aggregated });
  }

  return NextResponse.json({ error: "Vista no soportada." }, { status: 400 });
}
