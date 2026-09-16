const WWW = /^www\./i;

export function normalizeDomain(value: string | null | undefined) {
  if (!value) return "";
  let input = value.trim().toLowerCase();
  if (!input) return "";
  if (input.startsWith("sc-domain:")) input = input.slice("sc-domain:".length);
  input = input.replace(/^\/\//, "");
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    try {
      input = new URL(input).hostname;
    } catch {
      input = input.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").split("/")[0] ?? input;
    }
  } else {
    input = input.split("/")[0] ?? input;
  }
  input = input.split(":")[0] ?? input;
  input = input.replace(/\.$/, "");
  input = input.replace(WWW, "");
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(input) && !/^[a-z0-9]+$/.test(input)) return "";
  return input;
}

export function isSubdomainOf(hostname: string, parent: string) {
  return hostname === parent || hostname.endsWith(`.${parent}`);
}

export function isOwnDomain(resultDomain: string | null | undefined, projectDomain: string | null | undefined) {
  const result = normalizeDomain(resultDomain);
  const project = normalizeDomain(projectDomain);
  if (!result || !project) return false;
  return isSubdomainOf(result, project);
}

export type NormalizedUrl = {
  host: string;
  path: string;
};

export function normalizeUrl(value: string | null | undefined, fallbackHost?: string | null): NormalizedUrl | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : trimmed.startsWith("/")
        ? `https://${normalizeDomain(fallbackHost) || "example.invalid"}${trimmed}`
        : `https://${trimmed}`;
    const url = new URL(withProtocol);
    const host = normalizeDomain(url.hostname);
    if (!host) return null;
    let path = url.pathname.replace(/\/+$/, "") || "/";
    path = path.toLowerCase();
    return { host, path };
  } catch {
    return null;
  }
}

export function urlsMatch(left: string | null | undefined, right: string | null | undefined, fallbackHost?: string | null) {
  const a = normalizeUrl(left, fallbackHost);
  const b = normalizeUrl(right, fallbackHost);
  if (!a || !b) return false;
  return a.host === b.host && a.path === b.path;
}

export function targetUrlMismatch(rankedUrl: string | null | undefined, targetUrl: string | null | undefined, projectDomain?: string | null) {
  if (!targetUrl?.trim() || !rankedUrl?.trim()) return false;
  return !urlsMatch(rankedUrl, targetUrl, projectDomain);
}

export function normalizeKeyword(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function pageKey(value: string | null | undefined, fallbackHost?: string | null) {
  const normalized = normalizeUrl(value, fallbackHost);
  if (!normalized) return null;
  return `${normalized.host}${normalized.path}`;
}

export function pathOnly(value: string | null | undefined, fallbackHost?: string | null) {
  return normalizeUrl(value, fallbackHost)?.path ?? null;
}

export function keywordContextKey(input: {
  seoProjectId: string;
  normalizedKeyword: string;
  country: string;
  language: string;
  device: string;
  location: string;
}) {
  return [
    input.seoProjectId,
    input.normalizedKeyword,
    input.country.toLowerCase(),
    input.language.toLowerCase(),
    input.device.toLowerCase(),
    input.location.trim().toLowerCase(),
  ].join("|");
}
