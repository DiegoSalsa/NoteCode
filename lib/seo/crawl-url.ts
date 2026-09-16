const TRACKING_PARAMS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "mc_cid", "mc_eid"]);

export function normalizeCrawlUrl(value: string, base?: string) {
  const resolved = new URL(value, base);
  resolved.hash = "";
  resolved.hostname = resolved.hostname.toLowerCase();
  if ((resolved.protocol === "http:" && resolved.port === "80") || (resolved.protocol === "https:" && resolved.port === "443")) {
    resolved.port = "";
  }
  const params = resolved.searchParams;
  for (const key of [...params.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) params.delete(key);
  }
  const search = params.toString();
  resolved.search = search ? `?${search}` : "";
  if (resolved.pathname === "") resolved.pathname = "/";
  return resolved.toString();
}

export function sameSiteHost(url: string, allowedHost: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    const allowed = allowedHost.replace(/^www\./i, "").toLowerCase();
    return host === allowed;
  } catch {
    return false;
  }
}

export function isSkippableHref(href: string) {
  const value = href.trim().toLowerCase();
  if (!value || value.startsWith("#") || value.startsWith("mailto:") || value.startsWith("tel:") || value.startsWith("javascript:") || value.startsWith("data:")) return true;
  if (/\.(pdf|jpe?g|png|gif|webp|svg|mp4|mp3|zip|rar|css|js|woff2?|ico)(\?|$)/i.test(value)) return true;
  return false;
}
