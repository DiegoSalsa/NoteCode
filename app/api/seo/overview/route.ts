import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolvePeriod } from "@/lib/seo/dates";
import { isGoogleConfigured } from "@/lib/seo/config";
import { getActiveGoogleConnection, toPublicConnection } from "@/lib/seo/google-client";
import { loadPortfolioMetrics } from "@/lib/seo/metrics";
import { canManageSeo, canManageSeoIntegrations, canViewSeo } from "@/lib/seo/permissions";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  let period;
  try {
    period = resolvePeriod(searchParams.get("range"), searchParams.get("from"), searchParams.get("to"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Rango inválido" }, { status: 400 });
  }

  const clientId = searchParams.get("clientId");
  const status = searchParams.get("status");
  const [connection, portfolio, companyProjects] = await Promise.all([
    getActiveGoogleConnection(),
    loadPortfolioMetrics(period),
    prisma.project.findMany({
      where: { deletedAt: null, visibility: "COMPANY" },
      select: { id: true, name: true, status: true, client: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows = portfolio.filter((item) => {
    if (clientId && item.client?.id !== clientId) return false;
    if (status && item.status !== status) return false;
    return true;
  });

  const linkedIds = new Set(rows.map((item) => item.projectId));
  const unlinked = companyProjects.filter((project) => !linkedIds.has(project.id));

  return NextResponse.json({
    configured: isGoogleConfigured(),
    connection: toPublicConnection(connection),
    period,
    permissions: {
      view: true,
      manage: canManageSeo(user),
      integrations: canManageSeoIntegrations(user),
    },
    totals: {
      projects: rows.length,
      withGsc: rows.filter((item) => item.gsc).length,
      withGa4: rows.filter((item) => item.ga4).length,
      missingGsc: rows.filter((item) => !item.gsc).length + unlinked.length,
      missingGa4: rows.filter((item) => !item.ga4).length + unlinked.length,
      syncErrors: rows.filter((item) => item.lastGscSyncStatus === "error" || item.lastGa4SyncStatus === "error").length,
      clicks: rows.reduce((sum, item) => sum + item.metrics.gsc.clicks.value, 0),
      impressions: rows.reduce((sum, item) => sum + item.metrics.gsc.impressions.value, 0),
    },
    projects: rows,
    unlinked,
  });
}
