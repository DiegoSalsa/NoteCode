import type { SeoGoogleConnection } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/log";
import { googleApiJson } from "@/lib/seo/google-client";
import { displayNameFromSite, extractHostname } from "@/lib/seo/match";

type GscSitesResponse = {
  siteEntry?: Array<{ siteUrl?: string; permissionLevel?: string }>;
};

type Ga4SummariesResponse = {
  accountSummaries?: Array<{
    name?: string;
    displayName?: string;
    propertySummaries?: Array<{
      property?: string;
      displayName?: string;
      propertyType?: string;
    }>;
  }>;
};

export async function discoverGoogleProperties(connection: SeoGoogleConnection) {
  const [gsc, ga4] = await Promise.all([
    googleApiJson<GscSitesResponse>(
      connection,
      "https://www.googleapis.com/webmasters/v3/sites",
      { method: "GET" },
      { provider: "google_gsc", endpoint: "webmasters.sites.list" },
    ),
    googleApiJson<Ga4SummariesResponse>(
      connection,
      "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
      { method: "GET" },
      { provider: "google_ga4", endpoint: "analyticsadmin.accountSummaries" },
    ),
  ]);

  const rows: Array<{
    kind: string;
    externalId: string;
    parentExternalId: string | null;
    displayName: string;
    siteUrl: string | null;
    hostname: string | null;
    permissionLevel: string | null;
    metadata: Prisma.InputJsonValue;
  }> = [];

  for (const site of gsc.siteEntry ?? []) {
    if (!site.siteUrl) continue;
    const hostname = extractHostname(site.siteUrl);
    rows.push({
      kind: "GSC",
      externalId: site.siteUrl,
      parentExternalId: null,
      displayName: displayNameFromSite(site.siteUrl, hostname),
      siteUrl: site.siteUrl,
      hostname,
      permissionLevel: site.permissionLevel ?? null,
      metadata: { permissionLevel: site.permissionLevel ?? null },
    });
  }

  for (const account of ga4.accountSummaries ?? []) {
    if (!account.name) continue;
    rows.push({
      kind: "GA4_ACCOUNT",
      externalId: account.name,
      parentExternalId: null,
      displayName: account.displayName || account.name,
      siteUrl: null,
      hostname: null,
      permissionLevel: null,
      metadata: { displayName: account.displayName ?? null },
    });
    for (const property of account.propertySummaries ?? []) {
      if (!property.property) continue;
      rows.push({
        kind: "GA4_PROPERTY",
        externalId: property.property,
        parentExternalId: account.name,
        displayName: property.displayName || property.property,
        siteUrl: null,
        hostname: extractHostname(property.displayName || "") ,
        permissionLevel: null,
        metadata: { propertyType: property.propertyType ?? null, accountName: account.displayName ?? null },
      });
    }
  }

  for (const row of rows) {
    await prisma.seoGoogleProperty.upsert({
      where: { kind_externalId: { kind: row.kind, externalId: row.externalId } },
      update: {
        connectionId: connection.id,
        parentExternalId: row.parentExternalId,
        displayName: row.displayName,
        siteUrl: row.siteUrl,
        hostname: row.hostname,
        permissionLevel: row.permissionLevel,
        metadata: row.metadata,
      },
      create: {
        connectionId: connection.id,
        ...row,
      },
    });
  }

  const stale = await prisma.seoGoogleProperty.findMany({
    where: {
      connectionId: connection.id,
      externalId: { notIn: rows.map((row) => row.externalId) },
    },
    select: { id: true, kind: true, externalId: true },
  });
  if (stale.length) {
    await prisma.seoGoogleProperty.deleteMany({
      where: { id: { in: stale.map((item) => item.id) } },
    });
  }

  await prisma.seoGoogleConnection.update({
    where: { id: connection.id },
    data: { lastDiscoveredAt: new Date(), lastError: null, status: "connected" },
  });

  logEvent("info", "seo.google.discover", {
    connectionId: connection.id,
    gsc: rows.filter((row) => row.kind === "GSC").length,
    ga4: rows.filter((row) => row.kind === "GA4_PROPERTY").length,
  });

  return prisma.seoGoogleProperty.findMany({
    where: { connectionId: connection.id },
    orderBy: [{ kind: "asc" }, { displayName: "asc" }],
  });
}
