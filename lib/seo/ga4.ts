import type { SeoGoogleConnection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/log";
import { parseGoogleDate, truncateDimension } from "@/lib/seo/dates";
import { googleApiJson } from "@/lib/seo/google-client";
import { SeoHttpError } from "@/lib/seo/http";

type Ga4Row = {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
};

type Ga4Response = { rows?: Ga4Row[] };

function num(row: Ga4Row, index: number) {
  return Number(row.metricValues?.[index]?.value ?? 0) || 0;
}

function propertyPath(externalId: string) {
  return externalId.startsWith("properties/") ? externalId : `properties/${externalId}`;
}

async function runReport(
  connection: SeoGoogleConnection,
  propertyId: string,
  body: Record<string, unknown>,
  seoProjectId: string,
) {
  return googleApiJson<Ga4Response>(
    connection,
    `https://analyticsdata.googleapis.com/v1beta/${propertyPath(propertyId)}:runReport`,
    { method: "POST", body: JSON.stringify(body) },
    { provider: "google_ga4", endpoint: "analyticsdata.runReport", seoProjectId, timeoutMs: 30_000 },
  );
}

export async function syncGa4Range(
  connection: SeoGoogleConnection,
  seoProjectId: string,
  propertyId: string,
  from: string,
  to: string,
  includeDetails: boolean,
) {
  const started = Date.now();
  let records = 0;

  const siteMetrics = [
    { name: "activeUsers" },
    { name: "sessions" },
    { name: "engagedSessions" },
    { name: "engagementRate" },
    { name: "eventCount" },
    { name: "keyEvents" },
  ];

  let siteReport: Ga4Response;
  try {
    siteReport = await runReport(connection, propertyId, {
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: [{ name: "date" }],
      metrics: siteMetrics,
      limit: 100000,
    }, seoProjectId);
  } catch (error) {
    if (error instanceof SeoHttpError && /keyEvents/i.test(error.body)) {
      siteReport = await runReport(connection, propertyId, {
        dateRanges: [{ startDate: from, endDate: to }],
        dimensions: [{ name: "date" }],
        metrics: siteMetrics.filter((metric) => metric.name !== "keyEvents"),
        limit: 100000,
      }, seoProjectId);
    } else {
      throw error;
    }
  }

  const byDate = new Map<string, {
    users: number;
    sessions: number;
    engagedSessions: number;
    engagementRate: number;
    eventCount: number;
    keyEvents: number;
    organicSessions: number;
  }>();

  for (const row of siteReport.rows ?? []) {
    const dateKey = row.dimensionValues?.[0]?.value;
    if (!dateKey) continue;
    byDate.set(dateKey, {
      users: num(row, 0),
      sessions: num(row, 1),
      engagedSessions: num(row, 2),
      engagementRate: num(row, 3),
      eventCount: num(row, 4),
      keyEvents: num(row, 5),
      organicSessions: 0,
    });
  }

  try {
    const organic = await runReport(connection, propertyId, {
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
      dimensionFilter: {
        filter: {
          fieldName: "sessionDefaultChannelGroup",
          stringFilter: { value: "Organic Search" },
        },
      },
      limit: 100000,
    }, seoProjectId);
    for (const row of organic.rows ?? []) {
      const dateKey = row.dimensionValues?.[0]?.value;
      if (!dateKey) continue;
      const current = byDate.get(dateKey) ?? {
        users: 0, sessions: 0, engagedSessions: 0, engagementRate: 0, eventCount: 0, keyEvents: 0, organicSessions: 0,
      };
      current.organicSessions = num(row, 0);
      byDate.set(dateKey, current);
    }
  } catch (error) {
    logEvent("warn", "seo.ga4.organic_unavailable", {
      seoProjectId,
      message: error instanceof Error ? error.message : "organic filter failed",
    });
  }

  for (const [dateKey, metrics] of byDate) {
    const date = parseGoogleDate(dateKey);
    await prisma.seoGa4SiteDaily.upsert({
      where: { seoProjectId_date: { seoProjectId, date } },
      update: metrics,
      create: { seoProjectId, date, ...metrics },
    });
    records += 1;
  }

  if (includeDetails) {
    const landing = await runReport(connection, propertyId, {
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: [{ name: "date" }, { name: "landingPagePlusQueryString" }],
      metrics: [
        { name: "activeUsers" },
        { name: "sessions" },
        { name: "engagedSessions" },
        { name: "engagementRate" },
        { name: "keyEvents" },
      ],
      limit: 25000,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    }, seoProjectId).catch(async (error) => {
      if (!(error instanceof SeoHttpError)) throw error;
      return runReport(connection, propertyId, {
        dateRanges: [{ startDate: from, endDate: to }],
        dimensions: [{ name: "date" }, { name: "landingPage" }],
        metrics: [
          { name: "activeUsers" },
          { name: "sessions" },
          { name: "engagedSessions" },
          { name: "engagementRate" },
        ],
        limit: 25000,
      }, seoProjectId);
    });

    for (const row of landing.rows ?? []) {
      const dateKey = row.dimensionValues?.[0]?.value;
      const landingPage = row.dimensionValues?.[1]?.value;
      if (!dateKey || !landingPage) continue;
      const date = parseGoogleDate(dateKey);
      const payload = {
        users: num(row, 0),
        sessions: num(row, 1),
        engagedSessions: num(row, 2),
        engagementRate: num(row, 3),
        keyEvents: num(row, 4),
      };
      const page = truncateDimension(landingPage, 1024);
      await prisma.seoGa4LandingDaily.upsert({
        where: { seoProjectId_date_landingPage: { seoProjectId, date, landingPage: page } },
        update: payload,
        create: { seoProjectId, date, landingPage: page, ...payload },
      });
      records += 1;
    }

    const sources = await runReport(connection, propertyId, {
      dateRanges: [{ startDate: from, endDate: to }],
      dimensions: [{ name: "date" }, { name: "sessionSource" }, { name: "sessionMedium" }],
      metrics: [{ name: "activeUsers" }, { name: "sessions" }],
      limit: 25000,
    }, seoProjectId);

    for (const row of sources.rows ?? []) {
      const dateKey = row.dimensionValues?.[0]?.value;
      const source = truncateDimension(row.dimensionValues?.[1]?.value || "(direct)", 128);
      const medium = truncateDimension(row.dimensionValues?.[2]?.value || "(none)", 128);
      if (!dateKey) continue;
      const date = parseGoogleDate(dateKey);
      const payload = { users: num(row, 0), sessions: num(row, 1) };
      await prisma.seoGa4SourceDaily.upsert({
        where: { seoProjectId_date_source_medium: { seoProjectId, date, source, medium } },
        update: payload,
        create: { seoProjectId, date, source, medium, ...payload },
      });
      records += 1;
    }
  }

  logEvent("info", "seo.ga4.sync", {
    seoProjectId,
    property: propertyId,
    dateRange: `${from}:${to}`,
    rows: records,
    duration: Date.now() - started,
    status: "success",
    details: includeDetails,
  });

  return records;
}

export function ga4ErrorMessage(error: unknown) {
  if (error instanceof SeoHttpError) {
    if (error.status === 403) return "Sin permiso de lectura en esta propiedad de Analytics.";
    if (error.status === 404) return "La propiedad de Analytics ya no existe.";
    return `Analytics respondió HTTP ${error.status}.`;
  }
  return error instanceof Error ? error.message : "Error desconocido de Analytics.";
}
