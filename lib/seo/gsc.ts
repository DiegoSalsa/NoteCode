import type { SeoGoogleConnection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/log";
import { formatDateUTC, parseGoogleDate, truncateDimension } from "@/lib/seo/dates";
import { googleApiJson } from "@/lib/seo/google-client";
import { SeoHttpError } from "@/lib/seo/http";

type GscRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type GscResponse = { rows?: GscRow[] };

const ROW_LIMIT = 25_000;

async function querySearchAnalytics(
  connection: SeoGoogleConnection,
  siteUrl: string,
  body: Record<string, unknown>,
  seoProjectId: string,
) {
  const encoded = encodeURIComponent(siteUrl);
  return googleApiJson<GscResponse>(
    connection,
    `https://www.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
    { method: "POST", body: JSON.stringify(body) },
    { provider: "google_gsc", endpoint: "webmasters.searchAnalytics.query", seoProjectId },
  );
}

async function queryAllRows(
  connection: SeoGoogleConnection,
  siteUrl: string,
  base: Record<string, unknown>,
  seoProjectId: string,
) {
  const rows: GscRow[] = [];
  let startRow = 0;
  while (startRow < 100_000) {
    const page = await querySearchAnalytics(connection, siteUrl, { ...base, rowLimit: ROW_LIMIT, startRow }, seoProjectId);
    const batch = page.rows ?? [];
    rows.push(...batch);
    if (batch.length < ROW_LIMIT) break;
    startRow += ROW_LIMIT;
  }
  return rows;
}

function metricsOf(row: GscRow) {
  return {
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  };
}

export async function syncGscRange(
  connection: SeoGoogleConnection,
  seoProjectId: string,
  siteUrl: string,
  from: string,
  to: string,
  includeDetails: boolean,
) {
  const started = Date.now();
  let records = 0;

  const siteRows = await queryAllRows(connection, siteUrl, {
    startDate: from,
    endDate: to,
    dimensions: ["date"],
  }, seoProjectId);

  for (const row of siteRows) {
    const dateKey = row.keys?.[0];
    if (!dateKey) continue;
    const date = parseGoogleDate(dateKey);
    const metrics = metricsOf(row);
    await prisma.seoGscSiteDaily.upsert({
      where: { seoProjectId_date: { seoProjectId, date } },
      update: metrics,
      create: { seoProjectId, date, ...metrics },
    });
    records += 1;
  }

  if (includeDetails) {
    const detailSets: Array<{ dimensions: string[]; kind: "query" | "page" | "device" | "country" }> = [
      { dimensions: ["date", "query"], kind: "query" },
      { dimensions: ["date", "page"], kind: "page" },
      { dimensions: ["date", "device"], kind: "device" },
      { dimensions: ["date", "country"], kind: "country" },
    ];

    for (const set of detailSets) {
      const rows = await queryAllRows(connection, siteUrl, {
        startDate: from,
        endDate: to,
        dimensions: set.dimensions,
      }, seoProjectId);

      for (const row of rows) {
        const dateKey = row.keys?.[0];
        const dimension = row.keys?.[1];
        if (!dateKey || !dimension) continue;
        const date = parseGoogleDate(dateKey);
        const metrics = metricsOf(row);
        if (set.kind === "query") {
          const query = truncateDimension(dimension, 512);
          await prisma.seoGscQueryDaily.upsert({
            where: { seoProjectId_date_query: { seoProjectId, date, query } },
            update: metrics,
            create: { seoProjectId, date, query, ...metrics },
          });
        } else if (set.kind === "page") {
          const page = truncateDimension(dimension, 1024);
          await prisma.seoGscPageDaily.upsert({
            where: { seoProjectId_date_page: { seoProjectId, date, page } },
            update: metrics,
            create: { seoProjectId, date, page, ...metrics },
          });
        } else if (set.kind === "device") {
          const device = truncateDimension(dimension.toUpperCase(), 32);
          await prisma.seoGscDeviceDaily.upsert({
            where: { seoProjectId_date_device: { seoProjectId, date, device } },
            update: metrics,
            create: { seoProjectId, date, device, ...metrics },
          });
        } else {
          const country = truncateDimension(dimension.toUpperCase(), 8);
          await prisma.seoGscCountryDaily.upsert({
            where: { seoProjectId_date_country: { seoProjectId, date, country } },
            update: metrics,
            create: { seoProjectId, date, country, ...metrics },
          });
        }
        records += 1;
      }
    }
  }

  logEvent("info", "seo.gsc.sync", {
    seoProjectId,
    property: siteUrl,
    dateRange: `${from}:${to}`,
    rows: records,
    duration: Date.now() - started,
    status: "success",
    details: includeDetails,
  });

  return records;
}

export function isGscPermissionError(error: unknown) {
  if (!(error instanceof SeoHttpError)) return false;
  return error.status === 403 || error.status === 404;
}

export function gscErrorMessage(error: unknown) {
  if (error instanceof SeoHttpError) {
    if (error.status === 403) return "Sin permiso de lectura en esta propiedad de Search Console.";
    if (error.status === 404) return "La propiedad de Search Console ya no existe.";
    return `Search Console respondió HTTP ${error.status}.`;
  }
  return error instanceof Error ? error.message : "Error desconocido de Search Console.";
}

export function formatGscRangeLabel(from: Date, to: Date) {
  return `${formatDateUTC(from)} → ${formatDateUTC(to)}`;
}
