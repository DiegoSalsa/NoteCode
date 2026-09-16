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

export function seoSerpProviderName() {
  return (process.env.SEO_SERP_PROVIDER || "dataforseo").trim().toLowerCase();
}

export function isDataForSeoConfigured() {
  return Boolean(process.env.DATAFORSEO_LOGIN?.trim() && process.env.DATAFORSEO_PASSWORD?.trim());
}

export function isSerpProviderConfigured() {
  if (seoSerpProviderName() === "dataforseo") return isDataForSeoConfigured();
  return false;
}

export function seoSerpDepth() {
  const depth = Number(process.env.SEO_SERP_DEPTH || "100");
  if (!Number.isFinite(depth)) return 100;
  return Math.min(100, Math.max(10, Math.round(depth / 10) * 10));
}

export function seoSerpStoreLimit() {
  const limit = Number(process.env.SEO_SERP_STORE_LIMIT || "30");
  if (!Number.isFinite(limit)) return 30;
  return Math.min(100, Math.max(10, Math.round(limit)));
}

export function seoSerpConcurrency() {
  const value = Number(process.env.SEO_SERP_CONCURRENCY || "3");
  if (!Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(1, Math.round(value)));
}

export function seoRankingsCooldownMs() {
  const minutes = Number(process.env.SEO_RANKINGS_SYNC_COOLDOWN_MINUTES || "10");
  const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : 10;
  return safe * 60_000;
}

export function seoLiveSerpUnitCostUsd() {
  const value = Number(process.env.SEO_DATAFORSEO_LIVE_UNIT_USD || "0.002");
  return Number.isFinite(value) && value >= 0 ? value : 0.002;
}

export function estimateLiveSerpCostUsd(depth = seoSerpDepth()) {
  return seoLiveSerpUnitCostUsd() * Math.max(1, Math.ceil(depth / 10));
}

export function seoStandardSerpUnitCostUsd() {
  const value = Number(process.env.SEO_DATAFORSEO_STANDARD_UNIT_USD || "0.0006");
  return Number.isFinite(value) && value >= 0 ? value : 0.0006;
}

export function estimateSerpCostUsd(mode: "live" | "standard" = "live", depth = seoSerpDepth()) {
  const unit = mode === "standard" ? seoStandardSerpUnitCostUsd() : seoLiveSerpUnitCostUsd();
  return unit * Math.max(1, Math.ceil(depth / 10));
}

export function seoSerpManualMode(): "live" | "standard" {
  const value = (process.env.SEO_SERP_MANUAL_MODE || "live").trim().toLowerCase();
  return value === "standard" ? "standard" : "live";
}

export function seoSerpScheduledMode(): "live" | "standard" {
  const value = (process.env.SEO_SERP_SCHEDULED_MODE || "standard").trim().toLowerCase();
  return value === "live" ? "live" : "standard";
}

export function seoSerpModeForTrigger(trigger: "manual" | "cron"): "live" | "standard" {
  return trigger === "cron" ? seoSerpScheduledMode() : seoSerpManualMode();
}

export function isSeoAuditEnabled() {
  const value = process.env.SEO_AUDIT_ENABLED;
  if (value == null || value === "") return true;
  return !["0", "false", "off", "no"].includes(value.toLowerCase());
}

export function seoAuditIntervalDays() {
  const days = Number(process.env.SEO_AUDIT_INTERVAL_DAYS || "7");
  return Number.isFinite(days) && days > 0 ? days : 7;
}

export function seoAuditCooldownMs() {
  const minutes = Number(process.env.SEO_AUDIT_COOLDOWN_MINUTES || "30");
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 30) * 60_000;
}
