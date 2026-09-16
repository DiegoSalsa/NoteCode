export type MatchableProject = {
  id: string;
  name: string;
  description: string | null;
  client: { id: string; name: string; website: string | null } | null;
};

export type MatchableProperty = {
  id: string;
  kind: string;
  displayName: string;
  siteUrl: string | null;
  hostname: string | null;
  parentExternalId: string | null;
};

export type PropertySuggestion = {
  projectId: string;
  projectName: string;
  score: number;
  reason: string;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

function compact(value: string) {
  return normalize(value).replace(/[\s.]+/g, "");
}

export function extractHostname(siteUrl: string | null | undefined) {
  if (!siteUrl) return null;
  const trimmed = siteUrl.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith("sc-domain:")) {
    return trimmed.slice("sc-domain:".length).replace(/^www\./i, "").toLowerCase();
  }
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return trimmed.replace(/^www\./i, "").toLowerCase();
  }
}

export function displayNameFromSite(siteUrl: string, hostname: string | null) {
  if (hostname) {
    const label = hostname.split(".")[0] ?? hostname;
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return siteUrl;
}

function websiteHost(website: string | null) {
  if (!website) return null;
  return extractHostname(website);
}

export function scoreProjectMatch(property: MatchableProperty, project: MatchableProject) {
  const hostname = property.hostname || extractHostname(property.siteUrl);
  const projectName = normalize(project.name);
  const clientName = normalize(project.client?.name ?? "");
  const displayName = normalize(property.displayName);
  const clientHost = websiteHost(project.client?.website ?? null);
  const description = normalize(project.description ?? "");

  if (hostname && clientHost && (hostname === clientHost || hostname.endsWith(`.${clientHost}`) || clientHost.endsWith(`.${hostname}`))) {
    return { score: 100, reason: "Coincidencia de dominio con el sitio del cliente" };
  }
  if (hostname && (projectName.includes(normalize(hostname.split(".")[0] ?? "")) || compact(project.name).includes(compact(hostname.split(".")[0] ?? "")))) {
    return { score: 86, reason: "El nombre del proyecto coincide con el hostname" };
  }
  if (displayName && projectName && (displayName === projectName || compact(property.displayName) === compact(project.name))) {
    return { score: 84, reason: "El nombre de la propiedad coincide con el proyecto" };
  }
  if (displayName && clientName && (displayName === clientName || compact(property.displayName) === compact(project.client?.name ?? ""))) {
    return { score: 78, reason: "El nombre de la propiedad coincide con el cliente" };
  }
  if (hostname && description.includes(hostname)) {
    return { score: 64, reason: "El hostname aparece en la descripción del proyecto" };
  }
  if (displayName && projectName && (projectName.includes(displayName) || displayName.includes(projectName))) {
    return { score: 62, reason: "Coincidencia parcial de nombre" };
  }
  return { score: 0, reason: "" };
}

export function suggestProjectMatches(property: MatchableProperty, projects: MatchableProject[]): PropertySuggestion[] {
  return projects
    .map((project) => {
      const match = scoreProjectMatch(property, project);
      return {
        projectId: project.id,
        projectName: project.name,
        score: match.score,
        reason: match.reason,
      };
    })
    .filter((item) => item.score >= 60)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export function groupDiscoveredProperties(properties: MatchableProperty[]) {
  const groups = new Map<string, { key: string; label: string; hostname: string | null; gsc: MatchableProperty | null; ga4: MatchableProperty | null }>();

  for (const property of properties) {
    if (property.kind === "GA4_ACCOUNT") continue;
    const hostname = property.hostname || extractHostname(property.siteUrl);
    const key = compact(hostname || property.displayName) || property.id;
    const current = groups.get(key) ?? {
      key,
      label: property.displayName,
      hostname,
      gsc: null,
      ga4: null,
    };
    if (property.kind === "GSC") current.gsc = property;
    if (property.kind === "GA4_PROPERTY") current.ga4 = property;
    if (!current.label) current.label = property.displayName;
    groups.set(key, current);
  }

  return [...groups.values()];
}
