import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPANY_VISIBILITY } from "@/lib/personal-workspace";
import { getActiveGoogleConnection, toPublicConnection } from "@/lib/seo/google-client";
import { groupDiscoveredProperties, suggestProjectMatches } from "@/lib/seo/match";
import { canViewSeo } from "@/lib/seo/permissions";
import { isGoogleConfigured } from "@/lib/seo/config";

export async function GET() {
  const user = await getCurrentUser();
  if (!canViewSeo(user)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const connection = await getActiveGoogleConnection();
  const [properties, projects, links] = await Promise.all([
    connection
      ? prisma.seoGoogleProperty.findMany({
          where: { connectionId: connection.id },
          orderBy: [{ kind: "asc" }, { displayName: "asc" }],
        })
      : Promise.resolve([]),
    prisma.project.findMany({
      where: { deletedAt: null, visibility: COMPANY_VISIBILITY },
      select: {
        id: true,
        name: true,
        description: true,
        client: { select: { id: true, name: true, website: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.seoProject.findMany({
      where: { project: { deletedAt: null } },
      select: {
        id: true,
        projectId: true,
        gscPropertyId: true,
        ga4PropertyId: true,
        project: { select: { name: true } },
      },
    }),
  ]);

  const matchable = properties.map((property) => ({
    id: property.id,
    kind: property.kind,
    displayName: property.displayName,
    siteUrl: property.siteUrl,
    hostname: property.hostname,
    parentExternalId: property.parentExternalId,
  }));

  const groups = groupDiscoveredProperties(matchable).map((group) => {
    const seed = group.gsc || group.ga4;
    const suggestions = seed ? suggestProjectMatches(seed, projects) : [];
    const linked = links.filter((link) =>
      (group.gsc && link.gscPropertyId === group.gsc.id) || (group.ga4 && link.ga4PropertyId === group.ga4.id),
    );
    return {
      ...group,
      suggestions,
      linkedProjects: linked.map((link) => ({ id: link.projectId, name: link.project.name, seoProjectId: link.id })),
    };
  });

  return NextResponse.json({
    configured: isGoogleConfigured(),
    connection: toPublicConnection(connection),
    properties: properties.map((property) => ({
      id: property.id,
      kind: property.kind,
      externalId: property.externalId,
      parentExternalId: property.parentExternalId,
      displayName: property.displayName,
      siteUrl: property.siteUrl,
      hostname: property.hostname,
      permissionLevel: property.permissionLevel,
    })),
    groups,
    projects,
  });
}
