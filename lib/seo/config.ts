export const SEO_GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
] as const;

export const SEO_OAUTH_COOKIE = "notecode_seo_oauth";
export const SEO_OAUTH_COOKIE_MAX_AGE = 60 * 10;

export function isGoogleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function googleClientId() {
  return process.env.GOOGLE_CLIENT_ID?.trim() || "";
}

export function googleClientSecret() {
  return process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
}

export function googleRedirectUri(origin: string) {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return `${origin.replace(/\/$/, "")}/api/seo/google/callback`;
}

export function seoSyncStaleMs() {
  const hours = Number(process.env.SEO_SYNC_STALE_HOURS || "20");
  return (Number.isFinite(hours) && hours > 0 ? hours : 20) * 3_600_000;
}

export function seoDiscoverStaleMs() {
  const hours = Number(process.env.SEO_DISCOVER_STALE_HOURS || "24");
  return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 3_600_000;
}

export function seoIncrementalLookbackDays() {
  const days = Number(process.env.SEO_INCREMENTAL_LOOKBACK_DAYS || "7");
  return Number.isFinite(days) && days > 0 ? Math.min(days, 28) : 7;
}

export function seoHistoryDays() {
  const days = Number(process.env.SEO_HISTORY_DAYS || "480");
  return Number.isFinite(days) && days > 0 ? Math.min(days, 500) : 480;
}

export function seoDetailHistoryDays() {
  const days = Number(process.env.SEO_DETAIL_HISTORY_DAYS || "28");
  return Number.isFinite(days) && days > 0 ? Math.min(days, 90) : 28;
}

export function isSeoSyncEnabled() {
  const value = process.env.SEO_SYNC_ENABLED;
  if (value == null || value === "") return true;
  return !["0", "false", "off", "no"].includes(value.toLowerCase());
}
